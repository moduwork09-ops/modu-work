begin;

alter table public.share_policies
  add column if not exists share_shift_details boolean not null default false;

drop function if exists public.update_my_share_policy(uuid, boolean, boolean, boolean, boolean, boolean);

create function public.update_my_share_policy(
  p_space_id uuid,
  p_share_availability boolean,
  p_share_days_off boolean,
  p_share_personal_events boolean,
  p_share_shared_events boolean,
  p_share_shift_details boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_space_id is null
    or p_share_availability is null
    or p_share_days_off is null
    or p_share_personal_events is null
    or p_share_shared_events is null
    or p_share_shift_details is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if not public.is_together_member(p_space_id) then
    raise exception 'Active membership required' using errcode = '42501';
  end if;

  insert into public.share_policies (
    space_id,
    owner_user_id,
    share_availability,
    share_days_off,
    share_personal_events,
    share_shared_events,
    share_shift_details,
    updated_at
  ) values (
    p_space_id,
    v_user_id,
    p_share_availability,
    p_share_days_off,
    p_share_personal_events,
    p_share_shared_events,
    p_share_shift_details,
    now()
  )
  on conflict (space_id, owner_user_id) do update
  set share_availability = excluded.share_availability,
      share_days_off = excluded.share_days_off,
      share_personal_events = excluded.share_personal_events,
      share_shared_events = excluded.share_shared_events,
      share_shift_details = excluded.share_shift_details,
      updated_at = now();
end;
$$;

create table public.user_shift_schedule_projections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  shift_name text not null check (char_length(shift_name) between 1 and 80),
  shift_abbreviation text not null check (char_length(shift_abbreviation) between 1 and 12),
  shift_color text not null check (shift_color ~ '^#[0-9A-Fa-f]{6}$'),
  shift_text_color text not null check (shift_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  shift_kind text not null check (shift_kind in ('work', 'rest')),
  start_time time,
  end_time time,
  sync_batch_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.user_shift_schedule_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  sync_batch_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint user_shift_schedule_sync_state_valid_range check (range_start <= range_end)
);

alter table public.user_shift_schedule_projections enable row level security;
alter table public.user_shift_schedule_sync_state enable row level security;

create function public.sync_my_shift_schedule_projection_range(p_range_start date, p_range_end date, p_sync_batch_id uuid, p_days jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_date_text text;
  v_date date;
  v_expected_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_range_start is null or p_range_end is null or p_sync_batch_id is null or jsonb_typeof(p_days) <> 'array' then raise exception 'Invalid arguments' using errcode = '22023'; end if;
  v_expected_count := p_range_end - p_range_start + 1;
  if v_expected_count < 1 or v_expected_count > 800 or jsonb_array_length(p_days) <> v_expected_count then raise exception 'Invalid projection range' using errcode = '22023'; end if;
  if p_range_start < (current_date - interval '24 months')::date or p_range_end > (current_date + interval '24 months')::date then raise exception 'Date range is outside the allowed window' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_item) <> 'object'
      or (select count(*) from jsonb_object_keys(v_item)) <> 8
      or not (v_item ?& array['local_date','shift_name','shift_abbreviation','shift_color','shift_text_color','shift_kind','start_time','end_time'])
      or jsonb_typeof(v_item -> 'local_date') <> 'string'
      or jsonb_typeof(v_item -> 'shift_name') <> 'string'
      or jsonb_typeof(v_item -> 'shift_abbreviation') <> 'string'
      or jsonb_typeof(v_item -> 'shift_color') <> 'string'
      or jsonb_typeof(v_item -> 'shift_text_color') <> 'string'
      or jsonb_typeof(v_item -> 'shift_kind') <> 'string'
      or jsonb_typeof(v_item -> 'start_time') not in ('string','null')
      or jsonb_typeof(v_item -> 'end_time') not in ('string','null') then raise exception 'Invalid shift payload item' using errcode = '22023'; end if;
    v_date_text := v_item ->> 'local_date';
    begin v_date := v_date_text::date; exception when others then raise exception 'Invalid local_date' using errcode = '22023'; end;
    if to_char(v_date, 'YYYY-MM-DD') <> v_date_text or v_date not between p_range_start and p_range_end
      or char_length(v_item ->> 'shift_name') not between 1 and 80
      or char_length(v_item ->> 'shift_abbreviation') not between 1 and 12
      or (v_item ->> 'shift_color') !~ '^#[0-9A-Fa-f]{6}$'
      or (v_item ->> 'shift_text_color') !~ '^#[0-9A-Fa-f]{6}$'
      or (v_item ->> 'shift_kind') not in ('work','rest') then raise exception 'Invalid shift payload value' using errcode = '22023'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_days) item group by item ->> 'local_date' having count(*) > 1) then raise exception 'Duplicate local_date' using errcode = '22023'; end if;
  insert into public.user_shift_schedule_projections(user_id, local_date, shift_name, shift_abbreviation, shift_color, shift_text_color, shift_kind, start_time, end_time, sync_batch_id)
  select v_user_id, (item ->> 'local_date')::date, item ->> 'shift_name', item ->> 'shift_abbreviation', item ->> 'shift_color', item ->> 'shift_text_color', item ->> 'shift_kind', nullif(item ->> 'start_time','')::time, nullif(item ->> 'end_time','')::time, p_sync_batch_id
  from jsonb_array_elements(p_days) item
  on conflict(user_id, local_date) do update set shift_name=excluded.shift_name, shift_abbreviation=excluded.shift_abbreviation, shift_color=excluded.shift_color, shift_text_color=excluded.shift_text_color, shift_kind=excluded.shift_kind, start_time=excluded.start_time, end_time=excluded.end_time, sync_batch_id=excluded.sync_batch_id, updated_at=now();
  insert into public.user_shift_schedule_sync_state(user_id, range_start, range_end, sync_batch_id)
  values(v_user_id, p_range_start, p_range_end, p_sync_batch_id)
  on conflict(user_id) do update set range_start=least(user_shift_schedule_sync_state.range_start, excluded.range_start), range_end=greatest(user_shift_schedule_sync_state.range_end, excluded.range_end), sync_batch_id=excluded.sync_batch_id, updated_at=now();
end;
$$;

create function public.upsert_my_shift_schedule_projections(p_sync_batch_id uuid, p_days jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_date date;
  v_min_date date;
  v_max_date date;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_sync_batch_id is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 100 then raise exception 'Invalid arguments' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 8 or not (v_item ?& array['local_date','shift_name','shift_abbreviation','shift_color','shift_text_color','shift_kind','start_time','end_time']) then raise exception 'Invalid shift payload item' using errcode='22023'; end if;
    begin v_date := (v_item ->> 'local_date')::date; exception when others then raise exception 'Invalid local_date' using errcode='22023'; end;
    if to_char(v_date,'YYYY-MM-DD') <> v_item ->> 'local_date' or v_date < (current_date - interval '24 months')::date or v_date > (current_date + interval '24 months')::date
      or char_length(v_item ->> 'shift_name') not between 1 and 80 or char_length(v_item ->> 'shift_abbreviation') not between 1 and 12
      or (v_item ->> 'shift_color') !~ '^#[0-9A-Fa-f]{6}$' or (v_item ->> 'shift_text_color') !~ '^#[0-9A-Fa-f]{6}$' or (v_item ->> 'shift_kind') not in ('work','rest') then raise exception 'Invalid shift payload value' using errcode='22023'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_days) item group by item ->> 'local_date' having count(*) > 1) then raise exception 'Duplicate local_date' using errcode='22023'; end if;
  select min((item ->> 'local_date')::date), max((item ->> 'local_date')::date)
  into v_min_date, v_max_date
  from jsonb_array_elements(p_days) item;
  insert into public.user_shift_schedule_projections(user_id, local_date, shift_name, shift_abbreviation, shift_color, shift_text_color, shift_kind, start_time, end_time, sync_batch_id)
  select v_user_id, (item ->> 'local_date')::date, item ->> 'shift_name', item ->> 'shift_abbreviation', item ->> 'shift_color', item ->> 'shift_text_color', item ->> 'shift_kind', nullif(item ->> 'start_time','')::time, nullif(item ->> 'end_time','')::time, p_sync_batch_id from jsonb_array_elements(p_days) item
  on conflict(user_id,local_date) do update set shift_name=excluded.shift_name, shift_abbreviation=excluded.shift_abbreviation, shift_color=excluded.shift_color, shift_text_color=excluded.shift_text_color, shift_kind=excluded.shift_kind, start_time=excluded.start_time, end_time=excluded.end_time, sync_batch_id=excluded.sync_batch_id, updated_at=now();
  insert into public.user_shift_schedule_sync_state(user_id, range_start, range_end, sync_batch_id)
  values(v_user_id, v_min_date, v_max_date, p_sync_batch_id)
  on conflict(user_id) do update
  set range_start=least(user_shift_schedule_sync_state.range_start, excluded.range_start),
      range_end=greatest(user_shift_schedule_sync_state.range_end, excluded.range_end),
      sync_batch_id=excluded.sync_batch_id,
      updated_at=now();
end;
$$;

create function public.clear_my_shift_schedule_projections()
returns void language plpgsql security definer set search_path to '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  delete from public.user_shift_schedule_projections where user_id=v_user_id;
  delete from public.user_shift_schedule_sync_state where user_id=v_user_id;
end;
$$;

create function public.get_together_member_shift_schedule(p_space_id uuid, p_member_user_id uuid, p_from date, p_to date)
returns table(local_date date, sharing_enabled boolean, has_projection boolean, shift_name text, shift_abbreviation text, shift_color text, shift_text_color text, shift_kind text, start_time text, end_time text)
language plpgsql security definer set search_path to '' as $$
declare v_user_id uuid := auth.uid(); v_enabled boolean;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_space_id is null or p_member_user_id is null or p_from is null or p_to is null or p_from > p_to or p_to-p_from+1 > 62 then raise exception 'Invalid arguments' using errcode='22023'; end if;
  if p_from < (current_date - interval '24 months')::date or p_to > (current_date + interval '24 months')::date then raise exception 'Date range is outside the allowed window' using errcode='22023'; end if;
  if not public.is_together_member(p_space_id) then raise exception 'Active membership required' using errcode='42501'; end if;
  if not exists(select 1 from public.together_memberships where space_id=p_space_id and user_id=p_member_user_id and status='active') then raise exception 'Target active membership required' using errcode='42501'; end if;
  select coalesce(policy.share_shift_details,false) into v_enabled from public.share_policies policy where policy.space_id=p_space_id and policy.owner_user_id=p_member_user_id;
  return query
  select requested.day_date, coalesce(v_enabled,false), coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then projection.shift_name end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then projection.shift_abbreviation end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then projection.shift_color end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then projection.shift_text_color end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then projection.shift_kind end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then to_char(projection.start_time,'HH24:MI') end,
    case when coalesce(v_enabled,false) and state.user_id is not null and requested.day_date between state.range_start and state.range_end and projection.user_id is not null then to_char(projection.end_time,'HH24:MI') end
  from (select generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')::date day_date) requested
  left join public.user_shift_schedule_sync_state state on state.user_id=p_member_user_id
  left join public.user_shift_schedule_projections projection on projection.user_id=p_member_user_id and projection.local_date=requested.day_date
  order by requested.day_date;
end;
$$;

revoke all on table public.user_shift_schedule_projections from public, anon, authenticated;
revoke all on table public.user_shift_schedule_sync_state from public, anon, authenticated;
revoke all on function public.update_my_share_policy(uuid,boolean,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.sync_my_shift_schedule_projection_range(date,date,uuid,jsonb) from public, anon;
revoke all on function public.upsert_my_shift_schedule_projections(uuid,jsonb) from public, anon;
revoke all on function public.clear_my_shift_schedule_projections() from public, anon;
revoke all on function public.get_together_member_shift_schedule(uuid,uuid,date,date) from public, anon;
grant execute on function public.sync_my_shift_schedule_projection_range(date,date,uuid,jsonb) to authenticated, service_role;
grant execute on function public.update_my_share_policy(uuid,boolean,boolean,boolean,boolean,boolean) to authenticated, service_role;
grant execute on function public.upsert_my_shift_schedule_projections(uuid,jsonb) to authenticated, service_role;
grant execute on function public.clear_my_shift_schedule_projections() to authenticated, service_role;
grant execute on function public.get_together_member_shift_schedule(uuid,uuid,date,date) to authenticated, service_role;

commit;
