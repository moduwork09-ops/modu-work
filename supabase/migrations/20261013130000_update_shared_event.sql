begin;

create function public.update_shared_event(
  p_space_id uuid,
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_memo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_by uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_space_id is null or p_event_id is null then
    raise exception 'Invalid shared event identity' using errcode = '22023';
  end if;
  if public.is_together_member(p_space_id) is not true then
    raise exception 'Active membership required' using errcode = '42501';
  end if;

  select created_by into v_created_by
  from public.shared_events
  where id = p_event_id and space_id = p_space_id
  for update;

  if not found then
    raise exception 'Shared event not found' using errcode = 'P0002';
  end if;
  if v_created_by <> v_user_id then
    raise exception 'Only the creator can update shared event' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid shared event input' using errcode = '22023';
  end if;

  update public.shared_events
  set title = btrim(p_title),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      memo = nullif(btrim(p_memo), ''),
      updated_at = now()
  where id = p_event_id and space_id = p_space_id;
end;
$$;

revoke all privileges on function public.update_shared_event(uuid, uuid, text, timestamptz, timestamptz, text) from public;
revoke all privileges on function public.update_shared_event(uuid, uuid, text, timestamptz, timestamptz, text) from anon;
grant execute on function public.update_shared_event(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.update_shared_event(uuid, uuid, text, timestamptz, timestamptz, text) to service_role;

commit;
