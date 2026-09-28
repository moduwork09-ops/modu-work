begin;

create table public.preset_requests (
  normalized_query text primary key check (char_length(normalized_query) between 1 and 80),
  display_query text not null check (char_length(display_query) between 1 and 80),
  request_count bigint not null default 1 check (request_count > 0),
  last_requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.preset_requests enable row level security;
revoke all on table public.preset_requests from public, anon, authenticated;

create function public.record_preset_request(p_query text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_display text; v_normalized text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_query is null or char_length(p_query) > 100 then raise exception 'Invalid query' using errcode='22023'; end if;
  v_display := pg_catalog.btrim(pg_catalog.regexp_replace(p_query, '[[:space:]]+', ' ', 'g'));
  v_normalized := pg_catalog.lower(v_display);
  if char_length(v_normalized) not between 1 and 80 then raise exception 'Invalid query' using errcode='22023'; end if;
  insert into public.preset_requests(normalized_query, display_query)
  values(v_normalized, v_display)
  on conflict(normalized_query) do update set request_count=public.preset_requests.request_count+1, last_requested_at=now();
end; $$;

create table public.shift_preset_candidates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  preset_id uuid not null unique references public.shift_presets(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  job_role text check (job_role is null or char_length(job_role) between 1 and 80),
  workplace_name text check (workplace_name is null or char_length(workplace_name) between 1 and 80),
  department text check (department is null or char_length(department) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shift_preset_candidates_status_idx on public.shift_preset_candidates(status, created_at);
alter table public.shift_preset_candidates enable row level security;
revoke all on table public.shift_preset_candidates from public, anon, authenticated;

-- Candidate submissions only accept the calculation fields produced by the existing snapshot codec.
-- Notes/descriptions are excluded because they may contain personal text.
create function public.is_safe_preset_candidate_payload(p_payload jsonb)
returns boolean language plpgsql set search_path to '' as $$
declare v_type jsonb; v_team jsonb; v_rule jsonb; v_template jsonb;
begin
  if p_payload is null or public.is_valid_shift_preset_payload(p_payload) is distinct from true then return false; end if;
  if p_payload - 'shiftTypes' - 'pattern' - 'category' - 'initialPatternIndex' - 'teamRotationTemplate' - 'teamPhaseFromOffset' - 'conditionalRules' <> '{}'::jsonb then return false; end if;
  if p_payload ? 'category' and (pg_catalog.jsonb_typeof(p_payload->'category') <> 'string' or char_length(p_payload->>'category') > 80) then return false; end if;
  if p_payload ? 'initialPatternIndex' and (pg_catalog.jsonb_typeof(p_payload->'initialPatternIndex') <> 'number' or (p_payload->>'initialPatternIndex') !~ '^[0-9]+$' or (p_payload->>'initialPatternIndex')::integer >= pg_catalog.jsonb_array_length(p_payload->'pattern')) then return false; end if;
  if p_payload ? 'teamPhaseFromOffset' and (p_payload->'teamPhaseFromOffset' <> 'true'::jsonb or not (p_payload ? 'teamRotationTemplate')) then return false; end if;
  for v_type in select value from pg_catalog.jsonb_array_elements(p_payload->'shiftTypes') loop
    if v_type - 'key' - 'abbreviation' - 'name' - 'startTime' - 'endTime' - 'kind' - 'color' - 'textColor' <> '{}'::jsonb then return false; end if;
    if char_length(v_type->>'key') > 80 or char_length(v_type->>'name') > 80 or char_length(v_type->>'abbreviation') > 20 then return false; end if;
  end loop;
  if p_payload ? 'teamRotationTemplate' then
    v_template := p_payload->'teamRotationTemplate';
    if pg_catalog.jsonb_typeof(v_template) <> 'object' or v_template - 'version' - 'teams' <> '{}'::jsonb or v_template->>'version' <> '1' or pg_catalog.jsonb_typeof(v_template->'teams') <> 'array' then return false; end if;
    for v_team in select value from pg_catalog.jsonb_array_elements(v_template->'teams') loop
      if pg_catalog.jsonb_typeof(v_team) <> 'object' or v_team - 'id' - 'label' - 'patternIndexOffset' <> '{}'::jsonb then return false; end if;
      if pg_catalog.jsonb_typeof(v_team->'id') <> 'string' or pg_catalog.jsonb_typeof(v_team->'label') <> 'string'
        or pg_catalog.jsonb_typeof(v_team->'patternIndexOffset') <> 'number'
        or (v_team->>'patternIndexOffset') !~ '^[0-9]+$' or char_length(v_team->>'id') > 40 or char_length(v_team->>'label') > 40 then return false; end if;
    end loop;
  end if;
  if p_payload ? 'conditionalRules' then
    if pg_catalog.jsonb_typeof(p_payload->'conditionalRules') <> 'array' then return false; end if;
    for v_rule in select value from pg_catalog.jsonb_array_elements(p_payload->'conditionalRules') loop
      if pg_catalog.jsonb_typeof(v_rule) <> 'object' or v_rule - 'when' - 'baseShiftKey' - 'resolvedShiftKey' <> '{}'::jsonb then return false; end if;
      if v_rule->>'when' not in ('weekend','koreanHoliday','weekendOrHoliday')
        or not exists(select 1 from pg_catalog.jsonb_array_elements(p_payload->'shiftTypes') s where s->>'key'=v_rule->>'baseShiftKey')
        or not exists(select 1 from pg_catalog.jsonb_array_elements(p_payload->'shiftTypes') s where s->>'key'=v_rule->>'resolvedShiftKey') then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end; $$;

create function public.submit_shift_preset_candidate(p_preset_id uuid, p_payload jsonb, p_job_role text, p_workplace_name text, p_department text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_preset public.shift_presets; v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_preset from public.shift_presets where id=p_preset_id and created_by=v_user and revoked_at is null for update;
  if not found or v_preset.visibility <> 'unlisted' then raise exception 'Private preset owner required' using errcode='42501'; end if;
  if not public.is_safe_preset_candidate_payload(p_payload)
    or p_payload <> ((v_preset.payload - 'description' - 'shiftTypes') || pg_catalog.jsonb_build_object(
      'shiftTypes', (select pg_catalog.jsonb_agg(t.value - 'note' order by t.ordinality)
        from pg_catalog.jsonb_array_elements(v_preset.payload->'shiftTypes') with ordinality as t(value, ordinality))))
  then raise exception 'Unsafe candidate payload' using errcode='22023'; end if;
  if char_length(pg_catalog.btrim(p_job_role)) > 80 or char_length(pg_catalog.btrim(p_workplace_name)) > 80 or char_length(pg_catalog.btrim(p_department)) > 80 then raise exception 'Invalid candidate metadata' using errcode='22023'; end if;
  insert into public.shift_preset_candidates(preset_id, created_by, payload, job_role, workplace_name, department)
  values(p_preset_id, v_user, p_payload, nullif(pg_catalog.btrim(p_job_role),''), nullif(pg_catalog.btrim(p_workplace_name),''), nullif(pg_catalog.btrim(p_department),''))
  on conflict(preset_id) do update set payload=excluded.payload, job_role=excluded.job_role, workplace_name=excluded.workplace_name, department=excluded.department, updated_at=now()
  where public.shift_preset_candidates.created_by=v_user and public.shift_preset_candidates.status='pending'
  returning id into v_id;
  if v_id is null then raise exception 'Candidate cannot be changed' using errcode='42501'; end if;
  return v_id;
end; $$;

create table public.shift_preset_share_claims (
  share_id uuid not null references public.shift_preset_shares(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key(share_id, user_id)
);
create table public.preset_verifications (
  preset_id uuid not null references public.shift_presets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_id uuid not null references public.shift_preset_shares(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(preset_id, user_id)
);
create index preset_verifications_share_idx on public.preset_verifications(share_id);
alter table public.shift_preset_share_claims enable row level security;
alter table public.preset_verifications enable row level security;
revoke all on table public.shift_preset_share_claims from public, anon, authenticated;
revoke all on table public.preset_verifications from public, anon, authenticated;

-- Preserve the existing return shape and single/reusable claim contract.
create or replace function public.claim_shift_preset_share(p_code text)
returns table(id uuid, name text, organization_name text, payload jsonb, code text, mode text, claimed_by_current_user boolean)
language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_share public.shift_preset_shares;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_share from public.shift_preset_shares s where s.code=pg_catalog.upper(pg_catalog.btrim(p_code)) and s.revoked_at is null for update;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
  if v_share.mode='single' and v_share.created_by=v_user then raise exception 'Share creator cannot claim own code' using errcode='42501'; end if;
  if v_share.mode='single' and v_share.claimed_by is null then update public.shift_preset_shares set claimed_by=v_user,claimed_at=now() where shift_preset_shares.id=v_share.id;
  elsif v_share.mode='single' and v_share.claimed_by<>v_user then raise exception 'Share already claimed' using errcode='PT409'; end if;
  return query select p.id,p.name,p.organization_name,p.payload,v_share.code,v_share.mode,true from public.shift_presets p where p.id=v_share.preset_id and p.revoked_at is null;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
  if v_share.created_by<>v_user then
    insert into public.shift_preset_share_claims(share_id,user_id) values(v_share.id,v_user) on conflict do nothing;
  end if;
end; $$;

create function public.confirm_shift_preset_application(p_code text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_share public.shift_preset_shares;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_share from public.shift_preset_shares s where s.code=pg_catalog.upper(pg_catalog.btrim(p_code)) and s.revoked_at is null;
  if not found or v_share.created_by=v_user then raise exception 'Valid colleague share required' using errcode='42501'; end if;
  if not exists(select 1 from public.shift_preset_share_claims c where c.share_id=v_share.id and c.user_id=v_user)
    or not exists(select 1 from public.shift_presets p where p.id=v_share.preset_id and p.revoked_at is null)
    or (v_share.mode='single' and v_share.claimed_by<>v_user) then raise exception 'Claim required' using errcode='42501'; end if;
  insert into public.preset_verifications(preset_id,user_id,share_id) values(v_share.preset_id,v_user,v_share.id)
  on conflict(preset_id,user_id) do nothing;
  return true;
end; $$;

-- Return metadata only for approved candidates and real verification rows.
drop function public.search_shift_presets(text);
create function public.search_shift_presets(p_query text)
returns table(id uuid, name text, organization_name text, payload jsonb, job_role text, workplace_name text, department text, verification_count bigint, last_verified_at timestamptz)
language sql security definer set search_path to '' as $$
  select p.id, p.name, p.organization_name, p.payload, c.job_role, c.workplace_name, c.department,
    (select count(*) from public.preset_verifications v where v.preset_id=p.id),
    (select max(v.created_at) from public.preset_verifications v where v.preset_id=p.id)
  from public.shift_presets p
  left join public.shift_preset_candidates c on c.preset_id=p.id and c.status='approved'
  where auth.uid() is not null and p.visibility='public' and p.revoked_at is null
    and (p.name ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(p.organization_name,'') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(p.payload->>'category','') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(c.job_role,'') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(c.workplace_name,'') ilike '%' || pg_catalog.btrim(p_query) || '%'
      or coalesce(c.department,'') ilike '%' || pg_catalog.btrim(p_query) || '%')
  order by p.organization_name nulls last,p.name,p.id limit 50;
$$;

revoke all on function public.record_preset_request(text), public.is_safe_preset_candidate_payload(jsonb), public.submit_shift_preset_candidate(uuid,jsonb,text,text,text), public.confirm_shift_preset_application(text), public.search_shift_presets(text) from public, anon, authenticated;
revoke all on function public.claim_shift_preset_share(text) from public, anon, authenticated;
grant execute on function public.claim_shift_preset_share(text) to authenticated, service_role;
grant execute on function public.record_preset_request(text), public.submit_shift_preset_candidate(uuid,jsonb,text,text,text), public.confirm_shift_preset_application(text), public.search_shift_presets(text) to authenticated;
grant execute on function public.record_preset_request(text), public.is_safe_preset_candidate_payload(jsonb), public.submit_shift_preset_candidate(uuid,jsonb,text,text,text), public.confirm_shift_preset_application(text), public.search_shift_presets(text) to service_role;

commit;
