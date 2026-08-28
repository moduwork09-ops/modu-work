begin;

create or replace function public.update_together_space(
  p_space_id uuid,
  p_name text,
  p_type text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_space_id is null or p_name is null or p_type is null then
    raise exception 'Invalid together space update' using errcode = '22023';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 30 then
    raise exception 'Invalid together space name' using errcode = '22023';
  end if;

  if p_type not in ('family', 'couple', 'coworker', 'friend', 'custom') then
    raise exception 'Invalid together space type' using errcode = '22023';
  end if;

  if not public.is_together_owner(p_space_id) then
    raise exception 'Together owner access required' using errcode = '42501';
  end if;

  update public.together_spaces
  set name = v_name,
      type = p_type
  where id = p_space_id;

  if not found then
    raise exception 'Together owner access required' using errcode = '42501';
  end if;
end;
$$;

revoke all privileges on function public.update_together_space(uuid, text, text) from public;
revoke all privileges on function public.update_together_space(uuid, text, text) from anon;
revoke all privileges on function public.update_together_space(uuid, text, text) from authenticated;
grant execute on function public.update_together_space(uuid, text, text) to authenticated;
grant execute on function public.update_together_space(uuid, text, text) to service_role;

commit;
