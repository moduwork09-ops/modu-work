begin;

create table public.user_availability_projections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  start_minute smallint not null,
  end_minute smallint not null,
  timezone_name text not null,
  sync_batch_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_availability_projections_valid_interval check (
    start_minute >= 0
    and start_minute < end_minute
    and end_minute <= 1440
    and end_minute - start_minute >= 30
  ),
  constraint user_availability_projections_nonempty_timezone check (btrim(timezone_name) <> ''),
  primary key (user_id, local_date, start_minute, end_minute)
);

create index user_availability_projections_user_date_idx
on public.user_availability_projections (user_id, local_date);

create table public.user_availability_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  timezone_name text not null,
  last_sync_batch_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_availability_sync_state_valid_range check (range_start <= range_end),
  constraint user_availability_sync_state_nonempty_timezone check (btrim(timezone_name) <> '')
);

create or replace function public.set_user_availability_updated_at()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_user_availability_projections_updated_at
before update on public.user_availability_projections
for each row execute function public.set_user_availability_updated_at();

create trigger set_user_availability_sync_state_updated_at
before update on public.user_availability_sync_state
for each row execute function public.set_user_availability_updated_at();

alter table public.user_availability_projections enable row level security;
alter table public.user_availability_sync_state enable row level security;

create policy user_availability_projections_select_own
on public.user_availability_projections for select to authenticated
using (user_id = auth.uid());

create policy user_availability_sync_state_select_own
on public.user_availability_sync_state for select to authenticated
using (user_id = auth.uid());

create function public.sync_my_availability_projection_range(
  p_from date,
  p_to date,
  p_timezone_name text,
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sync_batch_id uuid := pg_catalog.gen_random_uuid();
  v_expected_count integer;
  v_day jsonb;
  v_day_ordinal bigint;
  v_date_text text;
  v_date date;
  v_intervals jsonb;
  v_interval jsonb;
  v_start integer;
  v_end integer;
  v_previous_end integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if p_from is null or p_to is null or p_timezone_name is null or p_days is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  v_expected_count := p_to - p_from + 1;
  if v_expected_count < 1 or v_expected_count > 800 then
    raise exception 'Date range must contain between 1 and 800 days' using errcode = '22023';
  end if;
  if p_from < (current_date - interval '24 months')::date
    or p_to > (current_date + interval '24 months')::date then
    raise exception 'Date range is outside the allowed window' using errcode = '22023';
  end if;
  if btrim(p_timezone_name) = '' or not exists (
    select 1 from pg_catalog.pg_timezone_names as timezone where timezone.name = p_timezone_name
  ) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> v_expected_count then
    raise exception 'Days payload must cover the complete range' using errcode = '22023';
  end if;

  for v_day, v_day_ordinal in
    select item.value, item.ordinality
    from jsonb_array_elements(p_days) with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(v_day) <> 'object'
      or not (v_day ? 'local_date') or not (v_day ? 'intervals')
      or (select count(*) from jsonb_object_keys(v_day)) <> 2
      or jsonb_typeof(v_day -> 'local_date') <> 'string'
      or jsonb_typeof(v_day -> 'intervals') <> 'array' then
      raise exception 'Invalid day payload item' using errcode = '22023';
    end if;
    v_date_text := v_day ->> 'local_date';
    if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid local_date' using errcode = '22023';
    end if;
    begin
      v_date := v_date_text::date;
    exception when others then
      raise exception 'Invalid local_date' using errcode = '22023';
    end;
    if to_char(v_date, 'YYYY-MM-DD') <> v_date_text
      or v_date <> p_from + (v_day_ordinal::integer - 1) then
      raise exception 'Days payload must be sorted and complete' using errcode = '22023';
    end if;

    v_intervals := v_day -> 'intervals';
    v_previous_end := null;
    for v_interval in select value from jsonb_array_elements(v_intervals)
    loop
      if jsonb_typeof(v_interval) <> 'object'
        or not (v_interval ? 'start_minute') or not (v_interval ? 'end_minute')
        or (select count(*) from jsonb_object_keys(v_interval)) <> 2
        or jsonb_typeof(v_interval -> 'start_minute') <> 'number'
        or jsonb_typeof(v_interval -> 'end_minute') <> 'number'
        or (v_interval ->> 'start_minute') !~ '^[0-9]+$'
        or (v_interval ->> 'end_minute') !~ '^[0-9]+$' then
        raise exception 'Invalid availability interval' using errcode = '22023';
      end if;
      v_start := (v_interval ->> 'start_minute')::integer;
      v_end := (v_interval ->> 'end_minute')::integer;
      if v_start < 0 or v_start >= v_end or v_end > 1440 or v_end - v_start < 30
        or (v_previous_end is not null and v_start <= v_previous_end) then
        raise exception 'Intervals must be normalized, non-overlapping, and at least 30 minutes' using errcode = '22023';
      end if;
      v_previous_end := v_end;
    end loop;
  end loop;

  delete from public.user_availability_projections
  where user_id = v_user_id;

  insert into public.user_availability_projections (
    user_id, local_date, start_minute, end_minute, timezone_name, sync_batch_id
  )
  select v_user_id, (day_item.value ->> 'local_date')::date,
    (interval_item.value ->> 'start_minute')::smallint,
    (interval_item.value ->> 'end_minute')::smallint,
    p_timezone_name, v_sync_batch_id
  from jsonb_array_elements(p_days) as day_item(value)
  cross join lateral jsonb_array_elements(day_item.value -> 'intervals') as interval_item(value);

  insert into public.user_availability_sync_state (
    user_id, range_start, range_end, timezone_name, last_sync_batch_id
  ) values (v_user_id, p_from, p_to, p_timezone_name, v_sync_batch_id)
  on conflict (user_id) do update set
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    timezone_name = excluded.timezone_name,
    last_sync_batch_id = excluded.last_sync_batch_id;

  return v_sync_batch_id;
end;
$$;

create function public.replace_my_availability_projection_days(
  p_timezone_name text,
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sync_batch_id uuid := pg_catalog.gen_random_uuid();
  v_range_start date;
  v_range_end date;
  v_sync_timezone text;
  v_day jsonb;
  v_date_text text;
  v_date date;
  v_previous_date date;
  v_interval jsonb;
  v_start integer;
  v_end integer;
  v_previous_end integer;
  v_day_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if p_timezone_name is null or p_days is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if btrim(p_timezone_name) = '' or not exists (
    select 1 from pg_catalog.pg_timezone_names as timezone where timezone.name = p_timezone_name
  ) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'Days payload must be an array' using errcode = '22023';
  end if;
  v_day_count := jsonb_array_length(p_days);
  if v_day_count < 1 or v_day_count > 100 then
    raise exception 'Days payload must contain between 1 and 100 items' using errcode = '22023';
  end if;

  select range_start, range_end, timezone_name
  into v_range_start, v_range_end, v_sync_timezone
  from public.user_availability_sync_state
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Full availability sync is required' using errcode = '55000';
  end if;
  if v_sync_timezone <> p_timezone_name then
    raise exception 'Full availability sync is required for timezone changes' using errcode = '55000';
  end if;

  for v_day in select value from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(v_day) <> 'object'
      or not (v_day ? 'local_date') or not (v_day ? 'intervals')
      or (select count(*) from jsonb_object_keys(v_day)) <> 2
      or jsonb_typeof(v_day -> 'local_date') <> 'string'
      or jsonb_typeof(v_day -> 'intervals') <> 'array' then
      raise exception 'Invalid day payload item' using errcode = '22023';
    end if;
    v_date_text := v_day ->> 'local_date';
    if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid local_date' using errcode = '22023';
    end if;
    begin
      v_date := v_date_text::date;
    exception when others then
      raise exception 'Invalid local_date' using errcode = '22023';
    end;
    if to_char(v_date, 'YYYY-MM-DD') <> v_date_text
      or v_date < v_range_start or v_date > v_range_end
      or (v_previous_date is not null and v_date <= v_previous_date) then
      raise exception 'Days must be unique, sorted, and inside current coverage' using errcode = '22023';
    end if;
    v_previous_date := v_date;

    v_previous_end := null;
    for v_interval in select value from jsonb_array_elements(v_day -> 'intervals')
    loop
      if jsonb_typeof(v_interval) <> 'object'
        or not (v_interval ? 'start_minute') or not (v_interval ? 'end_minute')
        or (select count(*) from jsonb_object_keys(v_interval)) <> 2
        or jsonb_typeof(v_interval -> 'start_minute') <> 'number'
        or jsonb_typeof(v_interval -> 'end_minute') <> 'number'
        or (v_interval ->> 'start_minute') !~ '^[0-9]+$'
        or (v_interval ->> 'end_minute') !~ '^[0-9]+$' then
        raise exception 'Invalid availability interval' using errcode = '22023';
      end if;
      v_start := (v_interval ->> 'start_minute')::integer;
      v_end := (v_interval ->> 'end_minute')::integer;
      if v_start < 0 or v_start >= v_end or v_end > 1440 or v_end - v_start < 30
        or (v_previous_end is not null and v_start <= v_previous_end) then
        raise exception 'Intervals must be normalized, non-overlapping, and at least 30 minutes' using errcode = '22023';
      end if;
      v_previous_end := v_end;
    end loop;
  end loop;

  delete from public.user_availability_projections as projection
  using jsonb_array_elements(p_days) as day_item(value)
  where projection.user_id = v_user_id
    and projection.local_date = (day_item.value ->> 'local_date')::date;

  insert into public.user_availability_projections (
    user_id, local_date, start_minute, end_minute, timezone_name, sync_batch_id
  )
  select v_user_id, (day_item.value ->> 'local_date')::date,
    (interval_item.value ->> 'start_minute')::smallint,
    (interval_item.value ->> 'end_minute')::smallint,
    p_timezone_name, v_sync_batch_id
  from jsonb_array_elements(p_days) as day_item(value)
  cross join lateral jsonb_array_elements(day_item.value -> 'intervals') as interval_item(value);

  update public.user_availability_sync_state
  set last_sync_batch_id = v_sync_batch_id
  where user_id = v_user_id;

  return v_sync_batch_id;
end;
$$;

create function public.clear_my_availability_projections()
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  delete from public.user_availability_projections where user_id = v_user_id;
  delete from public.user_availability_sync_state where user_id = v_user_id;
end;
$$;

create function public.get_together_common_availability(
  p_space_id uuid,
  p_from date,
  p_to date
)
returns table (
  local_date date,
  availability_status text,
  timezone_name text,
  intervals jsonb
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_member_count integer;
  v_sharing_member_count integer;
  v_synced_member_count integer;
  v_timezone_count integer;
  v_timezone_name text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_space_id is null or p_from is null or p_to is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if not public.is_together_member(p_space_id) then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  if p_from > p_to or p_to - p_from + 1 > 62 then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_from < (current_date - interval '24 months')::date
    or p_to > (current_date + interval '24 months')::date then
    raise exception 'Date range is outside the allowed window' using errcode = '22023';
  end if;

  select count(*)::integer into v_active_member_count
  from public.together_memberships
  where space_id = p_space_id and status = 'active';

  select count(*)::integer into v_sharing_member_count
  from public.together_memberships as membership
  join public.share_policies as policy
    on policy.space_id = membership.space_id
    and policy.owner_user_id = membership.user_id
    and policy.share_availability = true
  where membership.space_id = p_space_id and membership.status = 'active';

  select count(*)::integer, count(distinct sync_state.timezone_name)::integer,
    min(sync_state.timezone_name)
  into v_synced_member_count, v_timezone_count, v_timezone_name
  from public.together_memberships as membership
  join public.user_availability_sync_state as sync_state
    on sync_state.user_id = membership.user_id
    and sync_state.range_start <= p_from
    and sync_state.range_end >= p_to
  where membership.space_id = p_space_id and membership.status = 'active';

  if v_active_member_count < 2 then
    v_status := 'not_enough_members';
    v_timezone_name := null;
  elsif v_sharing_member_count <> v_active_member_count then
    v_status := 'sharing_disabled';
    v_timezone_name := null;
  elsif v_synced_member_count <> v_active_member_count then
    v_status := 'not_synced';
    v_timezone_name := null;
  elsif v_timezone_count <> 1 then
    v_status := 'timezone_mismatch';
    v_timezone_name := null;
  else
    v_status := 'ready';
  end if;

  return query
  with requested_dates as (
    select generated.day_timestamp::date as day_date
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day')
      as generated(day_timestamp)
  ),
  endpoints as (
    select requested.day_date, projection.start_minute::integer as minute
    from requested_dates as requested
    join public.together_memberships as membership
      on membership.space_id = p_space_id and membership.status = 'active'
    join public.user_availability_projections as projection
      on projection.user_id = membership.user_id and projection.local_date = requested.day_date
    where v_status = 'ready'
    union
    select requested.day_date, projection.end_minute::integer as minute
    from requested_dates as requested
    join public.together_memberships as membership
      on membership.space_id = p_space_id and membership.status = 'active'
    join public.user_availability_projections as projection
      on projection.user_id = membership.user_id and projection.local_date = requested.day_date
    where v_status = 'ready'
  ),
  elementary_segments as (
    select day_date, minute as start_minute,
      lead(minute) over (partition by day_date order by minute) as end_minute
    from endpoints
  ),
  common_segments as (
    select segment.day_date, segment.start_minute, segment.end_minute
    from elementary_segments as segment
    where segment.end_minute > segment.start_minute
      and (select count(*)
        from public.together_memberships as membership
        where membership.space_id = p_space_id and membership.status = 'active'
          and exists (
            select 1 from public.user_availability_projections as projection
            where projection.user_id = membership.user_id
              and projection.local_date = segment.day_date
              and projection.start_minute <= segment.start_minute
              and projection.end_minute >= segment.end_minute
          )) = v_active_member_count
  ),
  segment_breaks as (
    select segment.*,
      case when lag(segment.end_minute) over (
        partition by segment.day_date order by segment.start_minute
      ) = segment.start_minute then 0 else 1 end as starts_group
    from common_segments as segment
  ),
  numbered_segments as (
    select segment.*,
      sum(segment.starts_group) over (
        partition by segment.day_date order by segment.start_minute
      ) as segment_group
    from segment_breaks as segment
  ),
  merged_segments as (
    select day_date, min(start_minute) as start_minute, max(end_minute) as end_minute
    from numbered_segments
    group by day_date, segment_group
    having max(end_minute) - min(start_minute) >= 30
  ),
  daily_intervals as (
    select merged.day_date,
      jsonb_agg(jsonb_build_object(
        'start_minute', merged.start_minute,
        'end_minute', merged.end_minute
      ) order by merged.start_minute) as intervals
    from merged_segments as merged
    group by merged.day_date
  )
  select requested.day_date, v_status,
    case when v_status = 'ready' then v_timezone_name else null end,
    case when v_status = 'ready' then coalesce(daily.intervals, '[]'::jsonb) else '[]'::jsonb end
  from requested_dates as requested
  left join daily_intervals as daily on daily.day_date = requested.day_date
  order by requested.day_date;
end;
$$;

revoke all privileges on table public.user_availability_projections from public;
revoke all privileges on table public.user_availability_projections from anon;
revoke all privileges on table public.user_availability_projections from authenticated;

revoke all privileges on table public.user_availability_sync_state from public;
revoke all privileges on table public.user_availability_sync_state from anon;
revoke all privileges on table public.user_availability_sync_state from authenticated;

revoke all privileges on function public.set_user_availability_updated_at() from public;

revoke all privileges on function public.sync_my_availability_projection_range(date, date, text, jsonb) from public;
revoke all privileges on function public.sync_my_availability_projection_range(date, date, text, jsonb) from anon;
grant execute on function public.sync_my_availability_projection_range(date, date, text, jsonb) to authenticated;
grant execute on function public.sync_my_availability_projection_range(date, date, text, jsonb) to service_role;

revoke all privileges on function public.replace_my_availability_projection_days(text, jsonb) from public;
revoke all privileges on function public.replace_my_availability_projection_days(text, jsonb) from anon;
grant execute on function public.replace_my_availability_projection_days(text, jsonb) to authenticated;
grant execute on function public.replace_my_availability_projection_days(text, jsonb) to service_role;

revoke all privileges on function public.clear_my_availability_projections() from public;
revoke all privileges on function public.clear_my_availability_projections() from anon;
grant execute on function public.clear_my_availability_projections() to authenticated;
grant execute on function public.clear_my_availability_projections() to service_role;

revoke all privileges on function public.get_together_common_availability(uuid, date, date) from public;
revoke all privileges on function public.get_together_common_availability(uuid, date, date) from anon;
grant execute on function public.get_together_common_availability(uuid, date, date) to authenticated;
grant execute on function public.get_together_common_availability(uuid, date, date) to service_role;

commit;
