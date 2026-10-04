begin;

-- New user presets always begin private. Existing public presets remain untouched.
create or replace function public.create_shift_preset(p_name text, p_organization_name text, p_visibility text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_visibility is distinct from 'unlisted' or p_name is null
    or char_length(pg_catalog.btrim(p_name)) not between 1 and 60
    or (nullif(pg_catalog.btrim(p_organization_name), '') is not null and char_length(pg_catalog.btrim(p_organization_name)) not between 1 and 80)
    or public.is_valid_shift_preset_payload(p_payload) is distinct from true
  then raise exception 'Invalid shift preset' using errcode='22023'; end if;
  insert into public.shift_presets(name, organization_name, payload, visibility, created_by)
  values (pg_catalog.btrim(p_name), nullif(pg_catalog.btrim(p_organization_name), ''), p_payload, 'unlisted', v_user)
  returning id into v_id;
  return v_id;
end; $$;

-- The service-role review action is the only application-level promotion path.
-- Candidate review and preset visibility change succeed or roll back together.
create function public.review_shift_preset_candidate(p_candidate_id uuid, p_decision text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_candidate public.shift_preset_candidates; v_preset public.shift_presets; v_preset_id uuid;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid review decision' using errcode='22023';
  end if;
  select preset_id into v_preset_id from public.shift_preset_candidates where id=p_candidate_id;
  if not found then raise exception 'Candidate not found' using errcode='PT404'; end if;
  -- Match submit_shift_preset_candidate's lock order: preset before candidate.
  select * into v_preset from public.shift_presets where id=v_preset_id for update;
  if not found then raise exception 'Candidate preset unavailable' using errcode='42501'; end if;
  select * into v_candidate from public.shift_preset_candidates where id=p_candidate_id for update;
  if not found or v_candidate.preset_id <> v_preset_id
    or v_preset.created_by <> v_candidate.created_by or v_preset.revoked_at is not null then
    raise exception 'Candidate preset unavailable' using errcode='42501';
  end if;
  if v_candidate.status = p_decision then
    if (p_decision='approved' and v_preset.visibility='public')
      or (p_decision='rejected' and v_preset.visibility='unlisted') then return; end if;
    raise exception 'Candidate review state inconsistent' using errcode='23514';
  end if;
  if v_candidate.status <> 'pending' or v_preset.visibility <> 'unlisted'
    or v_candidate.pattern_fingerprint is null then
    raise exception 'Pending private candidate required' using errcode='42501';
  end if;
  update public.shift_preset_candidates
    set status=p_decision, updated_at=now() where id=v_candidate.id;
  if p_decision='approved' then
    update public.shift_presets
      set visibility='public', updated_at=now() where id=v_candidate.preset_id;
  end if;
end; $$;

revoke all on function public.create_shift_preset(text,text,text,jsonb), public.review_shift_preset_candidate(uuid,text) from public, anon, authenticated;
grant execute on function public.create_shift_preset(text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.review_shift_preset_candidate(uuid,text) to service_role;

commit;
