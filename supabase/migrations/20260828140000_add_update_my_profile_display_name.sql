begin;

create or replace function public.update_my_profile_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := btrim(p_display_name);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_display_name is null
    or char_length(v_display_name) < 1
    or char_length(v_display_name) > 30 then
    raise exception 'Invalid profile display name' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = v_display_name,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all privileges on function public.update_my_profile_display_name(text) from public;
revoke all privileges on function public.update_my_profile_display_name(text) from anon;
revoke all privileges on function public.update_my_profile_display_name(text) from authenticated;
grant execute on function public.update_my_profile_display_name(text) to authenticated;
grant execute on function public.update_my_profile_display_name(text) to service_role;

commit;
