begin;

create table public.user_day_off_projections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  is_day_off boolean not null,
  sync_batch_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create table public.user_day_off_sync_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  sync_batch_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_day_off_sync_state_valid_range check (range_start <= range_end)
);

create or replace function public.set_user_day_off_updated_at()
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

drop trigger if exists set_user_day_off_projections_updated_at on public.user_day_off_projections;
create trigger set_user_day_off_projections_updated_at
before update on public.user_day_off_projections
for each row
execute function public.set_user_day_off_updated_at();

drop trigger if exists set_user_day_off_sync_state_updated_at on public.user_day_off_sync_state;
create trigger set_user_day_off_sync_state_updated_at
before update on public.user_day_off_sync_state
for each row
execute function public.set_user_day_off_updated_at();

alter table public.user_day_off_projections enable row level security;
alter table public.user_day_off_sync_state enable row level security;

create policy user_day_off_projections_select_own
on public.user_day_off_projections for select to authenticated
using (user_id = auth.uid());

create policy user_day_off_projections_insert_own
on public.user_day_off_projections for insert to authenticated
with check (user_id = auth.uid());

create policy user_day_off_projections_update_own
on public.user_day_off_projections for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_day_off_projections_delete_own
on public.user_day_off_projections for delete to authenticated
using (user_id = auth.uid());

create policy user_day_off_sync_state_select_own
on public.user_day_off_sync_state for select to authenticated
using (user_id = auth.uid());

create policy user_day_off_sync_state_insert_own
on public.user_day_off_sync_state for insert to authenticated
with check (user_id = auth.uid());

create policy user_day_off_sync_state_update_own
on public.user_day_off_sync_state for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_day_off_sync_state_delete_own
on public.user_day_off_sync_state for delete to authenticated
using (user_id = auth.uid());

create function public.sync_my_day_off_projection_range(
  p_range_start date,
  p_range_end date,
  p_sync_batch_id uuid,
  p_days jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_date_text text;
  v_date date;
  v_expected_count integer;
  v_existing_start date;
  v_existing_end date;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_range_start is null or p_range_end is null or p_sync_batch_id is null or p_days is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if p_range_start > p_range_end then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  v_expected_count := p_range_end - p_range_start + 1;
  if v_expected_count > 800 then
    raise exception 'Date range is too large' using errcode = '22023';
  end if;
  if p_range_start < (current_date - interval '24 months')::date
    or p_range_end > (current_date + interval '24 months')::date then
    raise exception 'Date range is outside the allowed window' using errcode = '22023';
  end if;
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'Days payload must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_days) <> v_expected_count then
    raise exception 'Days payload must cover the complete range' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'local_date')
      or not (v_item ? 'is_day_off')
      or (select count(*) from jsonb_object_keys(v_item)) <> 2
      or jsonb_typeof(v_item -> 'local_date') <> 'string'
      or jsonb_typeof(v_item -> 'is_day_off') <> 'boolean' then
      raise exception 'Invalid day payload item' using errcode = '22023';
    end if;

    v_date_text := v_item ->> 'local_date';
    if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid local_date' using errcode = '22023';
    end if;
    begin
      v_date := v_date_text::date;
    exception when others then
      raise exception 'Invalid local_date' using errcode = '22023';
    end;
    if to_char(v_date, 'YYYY-MM-DD') <> v_date_text
      or v_date < p_range_start
      or v_date > p_range_end then
      raise exception 'Day is outside the requested range' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_days) as day_item(value)
    group by day_item.value ->> 'local_date'
    having count(*) > 1
  ) then
    raise exception 'Duplicate local_date in days payload' using errcode = '22023';
  end if;

  insert into public.user_day_off_projections (user_id, local_date, is_day_off, sync_batch_id)
  select
    v_user_id,
    (day_item.value ->> 'local_date')::date,
    (day_item.value ->> 'is_day_off')::boolean,
    p_sync_batch_id
  from jsonb_array_elements(p_days) as day_item(value)
  on conflict (user_id, local_date) do update
  set is_day_off = excluded.is_day_off,
      sync_batch_id = excluded.sync_batch_id;

  select sync_state.range_start, sync_state.range_end
  into v_existing_start, v_existing_end
  from public.user_day_off_sync_state as sync_state
  where sync_state.user_id = v_user_id
  for update;

  if not found then
    insert into public.user_day_off_sync_state (user_id, range_start, range_end, sync_batch_id)
    values (v_user_id, p_range_start, p_range_end, p_sync_batch_id);
  elsif p_range_start <= v_existing_end + 1
    and p_range_end >= v_existing_start - 1 then
    update public.user_day_off_sync_state
    set range_start = least(v_existing_start, p_range_start),
        range_end = greatest(v_existing_end, p_range_end),
        sync_batch_id = p_sync_batch_id
    where user_id = v_user_id;
  else
    raise exception 'New range is not contiguous with existing coverage' using errcode = '22023';
  end if;
end;
$$;

create function public.upsert_my_day_off_projections(
  p_sync_batch_id uuid,
  p_days jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_date_text text;
  v_date date;
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_sync_batch_id is null or p_days is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'Days payload must be an array' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_days);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'Days payload must contain between 1 and 100 items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_days)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'local_date')
      or not (v_item ? 'is_day_off')
      or (select count(*) from jsonb_object_keys(v_item)) <> 2
      or jsonb_typeof(v_item -> 'local_date') <> 'string'
      or jsonb_typeof(v_item -> 'is_day_off') <> 'boolean' then
      raise exception 'Invalid day payload item' using errcode = '22023';
    end if;

    v_date_text := v_item ->> 'local_date';
    if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid local_date' using errcode = '22023';
    end if;
    begin
      v_date := v_date_text::date;
    exception when others then
      raise exception 'Invalid local_date' using errcode = '22023';
    end;
    if to_char(v_date, 'YYYY-MM-DD') <> v_date_text
      or v_date < (current_date - interval '24 months')::date
      or v_date > (current_date + interval '24 months')::date then
      raise exception 'Day is outside the allowed window' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_days) as day_item(value)
    group by day_item.value ->> 'local_date'
    having count(*) > 1
  ) then
    raise exception 'Duplicate local_date in days payload' using errcode = '22023';
  end if;

  insert into public.user_day_off_projections (user_id, local_date, is_day_off, sync_batch_id)
  select
    v_user_id,
    (day_item.value ->> 'local_date')::date,
    (day_item.value ->> 'is_day_off')::boolean,
    p_sync_batch_id
  from jsonb_array_elements(p_days) as day_item(value)
  on conflict (user_id, local_date) do update
  set is_day_off = excluded.is_day_off,
      sync_batch_id = excluded.sync_batch_id;
end;
$$;

create function public.get_together_common_days_off(
  p_space_id uuid,
  p_from date,
  p_to date
)
returns table (
  local_date date,
  my_is_day_off boolean,
  active_member_count integer,
  eligible_member_count integer,
  synced_member_count integer,
  day_off_member_count integer,
  is_common_day_off boolean,
  availability_status text
)
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
  if p_space_id is null or p_from is null or p_to is null then
    raise exception 'All arguments are required' using errcode = '22023';
  end if;
  if not public.is_together_member(p_space_id) then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  if p_from > p_to then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from + 1 > 62 then
    raise exception 'Date range is too large' using errcode = '22023';
  end if;
  if p_from < (current_date - interval '24 months')::date
    or p_to > (current_date + interval '24 months')::date then
    raise exception 'Date range is outside the allowed window' using errcode = '22023';
  end if;

  return query
  with requested_dates as (
    select generated.day_timestamp::date as day_date
    from generate_series(
      p_from::timestamp,
      p_to::timestamp,
      interval '1 day'
    ) as generated(day_timestamp)
  ),
  active_members as (
    select membership.user_id
    from public.together_memberships as membership
    where membership.space_id = p_space_id
      and membership.status = 'active'
  ),
  member_days as (
    select
      requested.day_date,
      member.user_id,
      coalesce(policy.share_days_off, false) as is_eligible,
      sync_state.user_id is not null
        and requested.day_date between sync_state.range_start and sync_state.range_end as has_coverage,
      projection.user_id is not null as has_projection,
      projection.is_day_off
    from requested_dates as requested
    cross join active_members as member
    left join public.share_policies as policy
      on policy.space_id = p_space_id
      and policy.owner_user_id = member.user_id
    left join public.user_day_off_sync_state as sync_state
      on sync_state.user_id = member.user_id
    left join public.user_day_off_projections as projection
      on projection.user_id = member.user_id
      and projection.local_date = requested.day_date
  ),
  aggregated as (
    select
      member_day.day_date,
      bool_or(member_day.is_day_off) filter (
        where member_day.user_id = v_user_id
          and member_day.has_coverage
          and member_day.has_projection
      ) as viewer_is_day_off,
      count(*)::integer as total_active_members,
      count(*) filter (where member_day.is_eligible)::integer as total_eligible_members,
      count(*) filter (
        where member_day.is_eligible and member_day.has_coverage and member_day.has_projection
      )::integer as total_synced_members,
      count(*) filter (
        where member_day.is_eligible
          and member_day.has_coverage
          and member_day.has_projection
          and member_day.is_day_off
      )::integer as total_day_off_members
    from member_days as member_day
    group by member_day.day_date
  )
  select
    aggregate.day_date,
    aggregate.viewer_is_day_off,
    aggregate.total_active_members,
    aggregate.total_eligible_members,
    aggregate.total_synced_members,
    aggregate.total_day_off_members,
    aggregate.total_active_members > 0
      and aggregate.total_eligible_members = aggregate.total_active_members
      and aggregate.total_synced_members = aggregate.total_active_members
      and aggregate.total_day_off_members = aggregate.total_active_members,
    case
      when aggregate.total_active_members > 0
        and aggregate.total_eligible_members = aggregate.total_active_members
        and aggregate.total_synced_members = aggregate.total_active_members
        and aggregate.total_day_off_members = aggregate.total_active_members then 'common'
      when aggregate.total_active_members > 0
        and aggregate.total_eligible_members = aggregate.total_active_members
        and aggregate.total_synced_members = aggregate.total_active_members then 'not_common'
      else 'unavailable'
    end
  from aggregated as aggregate
  order by aggregate.day_date;
end;
$$;

create function public.clear_my_day_off_projections()
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

  delete from public.user_day_off_projections where user_id = v_user_id;
  delete from public.user_day_off_sync_state where user_id = v_user_id;
end;
$$;

revoke all on table public.user_day_off_projections from public;
revoke all on table public.user_day_off_projections from anon;
revoke all on table public.user_day_off_projections from authenticated;
grant select on table public.user_day_off_projections to authenticated;

revoke all on table public.user_day_off_sync_state from public;
revoke all on table public.user_day_off_sync_state from anon;
revoke all on table public.user_day_off_sync_state from authenticated;
grant select on table public.user_day_off_sync_state to authenticated;

revoke all on function public.set_user_day_off_updated_at() from public;

revoke all on function public.sync_my_day_off_projection_range(date, date, uuid, jsonb) from public;
revoke all on function public.sync_my_day_off_projection_range(date, date, uuid, jsonb) from anon;
grant execute on function public.sync_my_day_off_projection_range(date, date, uuid, jsonb) to authenticated;

revoke all on function public.upsert_my_day_off_projections(uuid, jsonb) from public;
revoke all on function public.upsert_my_day_off_projections(uuid, jsonb) from anon;
grant execute on function public.upsert_my_day_off_projections(uuid, jsonb) to authenticated;

revoke all on function public.get_together_common_days_off(uuid, date, date) from public;
revoke all on function public.get_together_common_days_off(uuid, date, date) from anon;
grant execute on function public.get_together_common_days_off(uuid, date, date) to authenticated;

revoke all on function public.clear_my_day_off_projections() from public;
revoke all on function public.clear_my_day_off_projections() from anon;
grant execute on function public.clear_my_day_off_projections() to authenticated;

commit;
