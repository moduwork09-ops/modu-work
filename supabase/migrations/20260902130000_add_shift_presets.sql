begin;

create table public.shift_presets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  version integer not null default 1 check (version = 1),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  organization_name text check (organization_name is null or char_length(btrim(organization_name)) between 1 and 80),
  source text not null default 'mine' check (source in ('mine')),
  payload jsonb not null,
  visibility text not null check (visibility in ('public', 'unlisted')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.shift_preset_shares (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  preset_id uuid not null references public.shift_presets(id) on delete cascade,
  code text not null unique check (code ~ '^MW-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
  mode text not null check (mode in ('single', 'reusable')),
  created_by uuid not null references auth.users(id) on delete cascade,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((claimed_by is null and claimed_at is null) or (claimed_by is not null and claimed_at is not null))
);

create index shift_presets_public_search_idx on public.shift_presets (visibility, revoked_at, organization_name, name);
create index shift_preset_shares_preset_idx on public.shift_preset_shares (preset_id);

alter table public.shift_presets enable row level security;
alter table public.shift_preset_shares enable row level security;

create policy shift_presets_select_visible_or_owner on public.shift_presets for select to authenticated
using (created_by = auth.uid() or (visibility = 'public' and revoked_at is null));
create policy shift_preset_shares_select_owner on public.shift_preset_shares for select to authenticated
using (created_by = auth.uid());

create function public.is_valid_shift_preset_payload(p_payload jsonb)
returns boolean language sql immutable set search_path to '' as $$
  select jsonb_typeof(p_payload) = 'object'
    and jsonb_typeof(p_payload -> 'shiftTypes') = 'array'
    and jsonb_array_length(p_payload -> 'shiftTypes') between 1 and 30
    and jsonb_typeof(p_payload -> 'pattern') = 'array'
    and jsonb_array_length(p_payload -> 'pattern') between 1 and 120
    and not exists (
      select 1 from jsonb_array_elements(p_payload -> 'shiftTypes') s
      where jsonb_typeof(s) <> 'object'
        or coalesce(btrim(s ->> 'key'), '') = ''
        or coalesce(btrim(s ->> 'abbreviation'), '') = ''
        or coalesce(btrim(s ->> 'name'), '') = ''
        or s ->> 'kind' not in ('work', 'rest')
        or coalesce(btrim(s ->> 'color'), '') = ''
        or coalesce(btrim(s ->> 'textColor'), '') = ''
        or (s ->> 'kind' = 'work' and (coalesce(s ->> 'startTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(s ->> 'endTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
    )
    and (select count(*) = count(distinct s ->> 'key') from jsonb_array_elements(p_payload -> 'shiftTypes') s)
    and not exists (
      select 1 from jsonb_array_elements_text(p_payload -> 'pattern') k
      where not exists (select 1 from jsonb_array_elements(p_payload -> 'shiftTypes') s where s ->> 'key' = k)
    );
$$;

create function public.create_shift_preset(p_name text, p_organization_name text, p_visibility text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_visibility not in ('public','unlisted') or char_length(btrim(p_name)) not between 1 and 60 or (nullif(btrim(p_organization_name), '') is not null and char_length(btrim(p_organization_name)) not between 1 and 80) or not public.is_valid_shift_preset_payload(p_payload) then raise exception 'Invalid shift preset' using errcode = '22023'; end if;
  insert into public.shift_presets(name, organization_name, payload, visibility, created_by)
  values (btrim(p_name), nullif(btrim(p_organization_name), ''), p_payload, p_visibility, v_user) returning id into v_id;
  return v_id;
end; $$;

create function public.search_shift_presets(p_query text)
returns table(id uuid, name text, organization_name text, payload jsonb)
language sql security definer set search_path to '' as $$
  select p.id, p.name, p.organization_name, p.payload from public.shift_presets p
  where auth.uid() is not null and p.visibility = 'public' and p.revoked_at is null
    and (p.name ilike '%' || btrim(p_query) || '%' or coalesce(p.organization_name, '') ilike '%' || btrim(p_query) || '%')
  order by p.organization_name nulls last, p.name, p.id limit 50;
$$;

create function public.get_shift_preset(p_preset_id uuid)
returns table(id uuid, name text, organization_name text, payload jsonb)
language sql security definer set search_path to '' as $$
  select p.id, p.name, p.organization_name, p.payload from public.shift_presets p
  where auth.uid() is not null and p.id = p_preset_id and p.revoked_at is null
    and (p.visibility = 'public' or p.created_by = auth.uid());
$$;

create function public.make_shift_preset_share_code()
returns text language plpgsql volatile set search_path to '' as $$
declare v_bytes bytea := pg_catalog.decode(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex'); v_code text := 'MW-'; i integer;
begin
  for i in 0..7 loop v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(v_bytes, i) % 32) + 1, 1); end loop;
  return v_code;
end; $$;

create function public.create_shift_preset_share(p_preset_id uuid, p_mode text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_code text; i integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_mode not in ('single','reusable') or not exists(select 1 from public.shift_presets p where p.id=p_preset_id and p.created_by=v_user and p.revoked_at is null) then raise exception 'Preset owner required' using errcode='42501'; end if;
  for i in 1..5 loop
    v_code := public.make_shift_preset_share_code();
    begin insert into public.shift_preset_shares(preset_id,code,mode,created_by) values(p_preset_id,v_code,p_mode,v_user); return v_code;
    exception when unique_violation then null; end;
  end loop;
  raise exception 'Unable to allocate share code' using errcode='54000';
end; $$;

create function public.resolve_shift_preset_share(p_code text)
returns table(id uuid, name text, organization_name text, payload jsonb, code text, mode text, claimed_by_current_user boolean)
language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_share public.shift_preset_shares;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_share from public.shift_preset_shares s where s.code=upper(btrim(p_code)) and s.revoked_at is null;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
  if v_share.mode='single' and v_share.claimed_by is not null and v_share.claimed_by<>v_user and v_share.created_by<>v_user then raise exception 'Share already claimed' using errcode='PT409'; end if;
  return query select p.id,p.name,p.organization_name,p.payload,v_share.code,v_share.mode,coalesce(v_share.claimed_by=v_user,false) from public.shift_presets p where p.id=v_share.preset_id and p.revoked_at is null;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
end; $$;

create function public.claim_shift_preset_share(p_code text)
returns table(id uuid, name text, organization_name text, payload jsonb, code text, mode text, claimed_by_current_user boolean)
language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_share public.shift_preset_shares;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_share from public.shift_preset_shares s where s.code=upper(btrim(p_code)) and s.revoked_at is null for update;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
  if v_share.mode='single' and v_share.created_by=v_user then raise exception 'Share creator cannot claim own code' using errcode='42501'; end if;
  if v_share.mode='single' and v_share.claimed_by is null then update public.shift_preset_shares set claimed_by=v_user,claimed_at=now() where shift_preset_shares.id=v_share.id;
  elsif v_share.mode='single' and v_share.claimed_by<>v_user then raise exception 'Share already claimed' using errcode='PT409'; end if;
  return query select p.id,p.name,p.organization_name,p.payload,v_share.code,v_share.mode,true from public.shift_presets p where p.id=v_share.preset_id and p.revoked_at is null;
  if not found then raise exception 'Share not found' using errcode='PT404'; end if;
end; $$;

revoke all on table public.shift_presets from public, anon, authenticated;
revoke all on table public.shift_preset_shares from public, anon, authenticated;
revoke all on function public.is_valid_shift_preset_payload(jsonb) from public, anon, authenticated;
revoke all on function public.make_shift_preset_share_code() from public, anon, authenticated;

revoke all on function public.create_shift_preset(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.search_shift_presets(text) from public, anon, authenticated;
revoke all on function public.get_shift_preset(uuid) from public, anon, authenticated;
revoke all on function public.create_shift_preset_share(uuid,text) from public, anon, authenticated;
revoke all on function public.resolve_shift_preset_share(text) from public, anon, authenticated;
revoke all on function public.claim_shift_preset_share(text) from public, anon, authenticated;
grant execute on function public.create_shift_preset(text,text,text,jsonb), public.search_shift_presets(text), public.get_shift_preset(uuid), public.create_shift_preset_share(uuid,text), public.resolve_shift_preset_share(text), public.claim_shift_preset_share(text) to authenticated;
grant execute on function public.create_shift_preset(text,text,text,jsonb), public.search_shift_presets(text), public.get_shift_preset(uuid), public.create_shift_preset_share(uuid,text), public.resolve_shift_preset_share(text), public.claim_shift_preset_share(text) to service_role;

commit;
