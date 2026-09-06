begin;

create or replace function public.leave_together_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_space_id is null then
    raise exception 'Invalid together space id' using errcode = '22023';
  end if;

  select role, status
  into v_role, v_status
  from public.together_memberships
  where space_id = p_space_id
    and user_id = v_user_id
  for update;

  if not found or v_status <> 'active' then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  if v_role = 'owner' then
    raise exception 'Owner cannot leave together space' using errcode = '42501';
  end if;
  if v_role <> 'member' then
    raise exception 'Member access required' using errcode = '42501';
  end if;

  delete from public.shared_event_participants as participant
  using public.shared_events as event
  where participant.event_id = event.id
    and event.space_id = p_space_id
    and participant.user_id = v_user_id;

  delete from public.share_policies
  where space_id = p_space_id
    and owner_user_id = v_user_id;

  delete from public.together_memberships
  where space_id = p_space_id
    and user_id = v_user_id
    and role = 'member'
    and status = 'active';

  if not found then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
end;
$$;

revoke all privileges on function public.leave_together_space(uuid) from public;
revoke all privileges on function public.leave_together_space(uuid) from anon;
revoke all privileges on function public.leave_together_space(uuid) from authenticated;
grant execute on function public.leave_together_space(uuid) to authenticated;
grant execute on function public.leave_together_space(uuid) to service_role;

revoke all privileges on function public.delete_together_space(uuid) from public;
revoke all privileges on function public.delete_together_space(uuid) from anon;
revoke all privileges on function public.delete_together_space(uuid) from authenticated;
grant execute on function public.delete_together_space(uuid) to authenticated;
grant execute on function public.delete_together_space(uuid) to service_role;

commit;
