begin;

-- Legacy direct-public presets have no candidate. Preserve their public visibility,
-- share codes and owner while moving their calculation-only payload into Growth.
do $$
declare
  v_preset public.shift_presets;
  v_payload jsonb;
  v_fingerprint text;
begin
  for v_preset in
    select p.* from public.shift_presets p
    where p.visibility = 'public' and p.revoked_at is null
      and not exists (select 1 from public.shift_preset_candidates c where c.preset_id = p.id)
    order by p.id
  loop
    v_payload := (v_preset.payload - 'description' - 'shiftTypes') || pg_catalog.jsonb_build_object(
      'shiftTypes', (select pg_catalog.jsonb_agg(t.value - 'note' order by t.ordinality)
        from pg_catalog.jsonb_array_elements(v_preset.payload->'shiftTypes') with ordinality as t(value, ordinality)));
    if public.is_safe_preset_candidate_payload(v_payload) is distinct from true then
      raise exception 'Cannot safely backfill public preset %', v_preset.id using errcode = '22023';
    end if;
    v_fingerprint := public.shift_preset_pattern_fingerprint(v_payload);
    if v_fingerprint is null then
      raise exception 'Cannot fingerprint public preset %', v_preset.id using errcode = '22023';
    end if;
    insert into public.shift_preset_candidates
      (preset_id, created_by, payload, status, workplace_name, pattern_fingerprint)
    values (v_preset.id, v_preset.created_by, v_payload, 'approved', v_preset.organization_name, v_fingerprint)
    on conflict (preset_id) do nothing;
  end loop;
end; $$;

-- Keep search_shift_presets(text) unchanged for older app builds. Group eligibility
-- is stricter: an approved candidate with a server-generated fingerprint is required.
create or replace function public.search_shift_preset_groups(p_query text)
returns table(
  id uuid, name text, organization_name text, payload jsonb,
  pattern_fingerprint text, member_count bigint,
  job_role text, workplace_name text, department text,
  verification_count bigint, last_verified_at timestamptz
)
language sql security definer set search_path to '' as $$
  with eligible as (
    select p.id, p.name, p.organization_name, p.payload, p.created_at,
      c.pattern_fingerprint, c.job_role, c.workplace_name, c.department,
      v.verification_count, v.last_verified_at
    from public.shift_presets p
    join public.shift_preset_candidates c on c.preset_id = p.id
      and c.status = 'approved' and c.pattern_fingerprint is not null
    left join lateral (
      select count(*)::bigint as verification_count, max(pv.created_at) as last_verified_at
      from public.preset_verifications pv where pv.preset_id = p.id
    ) v on true
    where auth.uid() is not null and p.visibility = 'public' and p.revoked_at is null
  ),
  ranked as (
    select e.*,
      count(*) over (partition by e.pattern_fingerprint) as member_count,
      row_number() over (partition by e.pattern_fingerprint
        order by e.verification_count desc, e.created_at asc, e.id asc) as representative_rank
    from eligible e
  ),
  matched as (
    select distinct e.pattern_fingerprint from eligible e
    where e.name ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(e.organization_name, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(e.payload->>'category', '') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(e.job_role, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(e.workplace_name, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(e.department, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
  )
  select r.id, r.name, r.organization_name, r.payload,
    r.pattern_fingerprint, r.member_count,
    r.job_role, r.workplace_name, r.department,
    r.verification_count, r.last_verified_at
  from ranked r
  join matched m on m.pattern_fingerprint = r.pattern_fingerprint
  where r.representative_rank = 1
  order by r.organization_name nulls last, r.name, r.id
  limit 50;
$$;

revoke all on function public.search_shift_preset_groups(text) from public, anon, authenticated;
grant execute on function public.search_shift_preset_groups(text) to authenticated, service_role;

commit;
