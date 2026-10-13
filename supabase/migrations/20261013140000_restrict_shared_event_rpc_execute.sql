begin;

-- Shared-event CRUD and its authenticated membership dependencies are not public APIs.
revoke execute on function public.create_shared_event(
  uuid, text, timestamptz, timestamptz, uuid[], text, text,
  double precision, double precision, text, text
) from public, anon;
revoke execute on function public.update_shared_event(
  uuid, uuid, text, timestamptz, timestamptz, text
) from public, anon;
revoke execute on function public.delete_shared_event(uuid) from public, anon;
revoke execute on function public.get_together_members(uuid) from public, anon;
revoke execute on function public.is_together_member(uuid) from public, anon;

grant execute on function public.create_shared_event(
  uuid, text, timestamptz, timestamptz, uuid[], text, text,
  double precision, double precision, text, text
) to authenticated, service_role;
grant execute on function public.update_shared_event(
  uuid, uuid, text, timestamptz, timestamptz, text
) to authenticated, service_role;
grant execute on function public.delete_shared_event(uuid) to authenticated, service_role;
grant execute on function public.get_together_members(uuid) to authenticated, service_role;
grant execute on function public.is_together_member(uuid) to authenticated, service_role;

commit;
