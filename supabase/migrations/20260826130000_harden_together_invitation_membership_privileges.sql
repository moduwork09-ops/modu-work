begin;

revoke all privileges on table public.together_memberships from public;
revoke all privileges on table public.together_memberships from anon;
revoke all privileges on table public.together_memberships from authenticated;
grant select on table public.together_memberships to authenticated;

revoke all privileges on table public.together_invitations from public;
revoke all privileges on table public.together_invitations from anon;
revoke all privileges on table public.together_invitations from authenticated;
grant select on table public.together_invitations to authenticated;

revoke all privileges on function public.create_together_invitation(uuid) from public;
revoke all privileges on function public.create_together_invitation(uuid) from anon;
grant execute on function public.create_together_invitation(uuid) to authenticated;
grant execute on function public.create_together_invitation(uuid) to service_role;

revoke all privileges on function public.accept_together_invitation(text) from public;
revoke all privileges on function public.accept_together_invitation(text) from anon;
grant execute on function public.accept_together_invitation(text) to authenticated;
grant execute on function public.accept_together_invitation(text) to service_role;

commit;
