begin;

alter table public.shift_preset_candidates
  add column pattern_fingerprint text
  check (pattern_fingerprint is null or pattern_fingerprint ~ '^v1:[0-9a-f]{64}$');

-- The exact ASCII signature used by the TypeScript canonicalizer. Display fields are excluded.
create function public.shift_preset_calculation_signature(p_shift jsonb)
returns text language plpgsql immutable set search_path to '' as $$
declare v_kind text := p_shift->>'kind'; v_start text := p_shift->>'startTime'; v_end text := p_shift->>'endTime';
begin
  if v_kind not in ('work', 'rest') or (v_start is null) <> (v_end is null) then return null; end if;
  if v_kind = 'work' and v_start is null then return null; end if;
  if v_start is not null and (v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return null; end if;
  return v_kind || ':' || coalesce(v_start, '-') || ':' || coalesce(v_end, '-');
end; $$;

create function public.canonical_shift_preset_pattern(p_payload jsonb)
returns text language plpgsql stable set search_path to '' as $$
declare
  v_signatures jsonb := '{}'::jsonb;
  v_shift jsonb; v_rule jsonb; v_team jsonb; v_key text; v_base text; v_resolved text;
  v_rules text[]; v_sorted_rules text[]; v_outputs text[]; v_tokens text[] := array[]::text[];
  v_length integer; v_i integer; v_j integer; v_state integer; v_first integer;
  v_weekend boolean; v_holiday boolean; v_rotation text; v_best text; v_team_offsets text := '-';
begin
  if public.is_safe_preset_candidate_payload(p_payload) is distinct from true then return null; end if;
  v_length := pg_catalog.jsonb_array_length(p_payload->'pattern');
  if v_length < 1 then return null; end if;

  for v_shift in select value from pg_catalog.jsonb_array_elements(p_payload->'shiftTypes') loop
    v_base := public.shift_preset_calculation_signature(v_shift);
    if v_base is null then return null; end if;
    v_signatures := v_signatures || pg_catalog.jsonb_build_object(v_shift->>'key', v_base);
  end loop;

  -- An unused rule base is invalid for this identity: it cannot be assigned to a cycle step.
  for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_payload->'conditionalRules', '[]'::jsonb)) loop
    if not (p_payload->'pattern' ? (v_rule->>'baseShiftKey')) then return null; end if;
  end loop;

  for v_key in select value from pg_catalog.jsonb_array_elements_text(p_payload->'pattern') loop
    v_base := v_signatures->>v_key;
    if v_base is null then return null; end if;
    v_rules := array[]::text[];
    for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_payload->'conditionalRules', '[]'::jsonb)) loop
      if v_rule->>'baseShiftKey' <> v_key then continue; end if;
      v_resolved := v_signatures->>(v_rule->>'resolvedShiftKey');
      if v_resolved is null then return null; end if;
      v_rules := pg_catalog.array_append(v_rules, (v_rule->>'when') || '>' || v_resolved);
    end loop;
    select pg_catalog.array_agg(x.value order by x.value collate "C") into v_sorted_rules
      from pg_catalog.unnest(v_rules) as x(value);
    v_outputs := array[]::text[];
    for v_state in 0..3 loop
      v_weekend := v_state in (1, 3);
      v_holiday := v_state in (2, 3);
      v_resolved := v_base;
      -- Follow the current first-matching-rule resolver, including overlap precedence.
      for v_rule in select value from pg_catalog.jsonb_array_elements(coalesce(p_payload->'conditionalRules', '[]'::jsonb)) loop
        if v_rule->>'baseShiftKey' <> v_key then continue; end if;
        if (v_rule->>'when' = 'weekend' and v_weekend)
          or (v_rule->>'when' <> 'weekend' and ((v_rule->>'when' = 'weekendOrHoliday' and v_weekend) or v_holiday)) then
          v_resolved := v_signatures->>(v_rule->>'resolvedShiftKey');
          exit;
        end if;
      end loop;
      v_outputs := pg_catalog.array_append(v_outputs, v_resolved);
    end loop;
    v_tokens := pg_catalog.array_append(v_tokens, v_base || '{' || pg_catalog.array_to_string(coalesce(v_sorted_rules, array[]::text[]), ',') || '}[' || pg_catalog.array_to_string(v_outputs, ',') || ']');
  end loop;

  -- A different initial phase is the same cyclic pattern; reversing the cycle is not.
  for v_i in 1..v_length loop
    v_rotation := '';
    for v_j in 0..v_length-1 loop
      if v_j > 0 then v_rotation := v_rotation || ';'; end if;
      v_rotation := v_rotation || v_tokens[((v_i + v_j - 1) % v_length) + 1];
    end loop;
    if v_best is null or v_rotation collate "C" < v_best collate "C" then v_best := v_rotation; end if;
  end loop;

  if p_payload ? 'teamRotationTemplate' then
    if pg_catalog.jsonb_array_length(p_payload->'teamRotationTemplate'->'teams') < 2
      or (select count(distinct t.value->>'id') <> count(*)
          from pg_catalog.jsonb_array_elements(p_payload->'teamRotationTemplate'->'teams') as t(value))
    then return null; end if;
    v_team_offsets := '';
    v_first := (p_payload->'teamRotationTemplate'->'teams'->0->>'patternIndexOffset')::integer;
    for v_team in select value from pg_catalog.jsonb_array_elements(p_payload->'teamRotationTemplate'->'teams') loop
      if v_team_offsets <> '' then v_team_offsets := v_team_offsets || ','; end if;
      v_team_offsets := v_team_offsets || (((((v_team->>'patternIndexOffset')::integer - v_first) % v_length) + v_length) % v_length)::text;
    end loop;
  end if;
  return 'v1|cycle=' || v_best || '|teams=' || v_team_offsets;
exception when others then
  -- Legacy malformed rows remain ungrouped; new submissions below reject a null result.
  return null;
end; $$;

create function public.shift_preset_pattern_fingerprint(p_payload jsonb)
returns text language sql stable set search_path to '' as $$
  select case when c.canonical is null then null
    else 'v1:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(c.canonical, 'UTF8')), 'hex') end
  from (select public.canonical_shift_preset_pattern(p_payload) as canonical) c;
$$;

update public.shift_preset_candidates
  set pattern_fingerprint = public.shift_preset_pattern_fingerprint(payload);

create index shift_preset_candidates_pattern_fingerprint_idx
  on public.shift_preset_candidates(pattern_fingerprint);

-- Keep the existing RPC signature and payload/owner validation; only the server-written
-- fingerprint is new. A caller never supplies a trusted fingerprint parameter.
create or replace function public.submit_shift_preset_candidate(p_preset_id uuid, p_payload jsonb, p_job_role text, p_workplace_name text, p_department text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_preset public.shift_presets; v_id uuid; v_fingerprint text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_preset from public.shift_presets where id=p_preset_id and created_by=v_user and revoked_at is null for update;
  if not found or v_preset.visibility <> 'unlisted' then raise exception 'Private preset owner required' using errcode='42501'; end if;
  if not public.is_safe_preset_candidate_payload(p_payload)
    or p_payload <> ((v_preset.payload - 'description' - 'shiftTypes') || pg_catalog.jsonb_build_object(
      'shiftTypes', (select pg_catalog.jsonb_agg(t.value - 'note' order by t.ordinality)
        from pg_catalog.jsonb_array_elements(v_preset.payload->'shiftTypes') with ordinality as t(value, ordinality))))
  then raise exception 'Unsafe candidate payload' using errcode='22023'; end if;
  v_fingerprint := public.shift_preset_pattern_fingerprint(p_payload);
  if v_fingerprint is null then raise exception 'Invalid candidate pattern' using errcode='22023'; end if;
  if char_length(pg_catalog.btrim(p_job_role)) > 80 or char_length(pg_catalog.btrim(p_workplace_name)) > 80 or char_length(pg_catalog.btrim(p_department)) > 80 then raise exception 'Invalid candidate metadata' using errcode='22023'; end if;
  insert into public.shift_preset_candidates(preset_id, created_by, payload, job_role, workplace_name, department, pattern_fingerprint)
  values(p_preset_id, v_user, p_payload, nullif(pg_catalog.btrim(p_job_role),''), nullif(pg_catalog.btrim(p_workplace_name),''), nullif(pg_catalog.btrim(p_department),''), v_fingerprint)
  on conflict(preset_id) do update set payload=excluded.payload, job_role=excluded.job_role, workplace_name=excluded.workplace_name, department=excluded.department, pattern_fingerprint=excluded.pattern_fingerprint, updated_at=now()
  where public.shift_preset_candidates.created_by=v_user and public.shift_preset_candidates.status='pending'
  returning id into v_id;
  if v_id is null then raise exception 'Candidate cannot be changed' using errcode='42501'; end if;
  return v_id;
end; $$;

revoke all on function public.shift_preset_calculation_signature(jsonb), public.canonical_shift_preset_pattern(jsonb), public.shift_preset_pattern_fingerprint(jsonb), public.submit_shift_preset_candidate(uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.shift_preset_calculation_signature(jsonb), public.canonical_shift_preset_pattern(jsonb), public.shift_preset_pattern_fingerprint(jsonb), public.submit_shift_preset_candidate(uuid,jsonb,text,text,text) to service_role;
grant execute on function public.submit_shift_preset_candidate(uuid,jsonb,text,text,text) to authenticated;

commit;
