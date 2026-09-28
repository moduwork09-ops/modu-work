begin;

create table public.user_entitlements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement in ('premium')),
  source text not null check (source in ('beta','event','admin','play_subscription')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create index user_entitlements_user_idx on public.user_entitlements(user_id, entitlement, is_active);
alter table public.user_entitlements enable row level security;
create policy user_entitlements_read_own on public.user_entitlements for select to authenticated using (auth.uid()=user_id);
revoke all on table public.user_entitlements from public, anon, authenticated;
grant select on table public.user_entitlements to authenticated;
grant select, insert, update, delete on table public.user_entitlements to service_role;

-- Admin/service role provisions codes by storing SHA-256 of normalized uppercase alphanumerics.
-- PostgreSQL's built-in sha256(bytea) avoids a pgcrypto extension dependency.
create table public.entitlement_codes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code_hash bytea not null unique check (pg_catalog.octet_length(code_hash)=32),
  campaign_name text not null check (char_length(pg_catalog.btrim(campaign_name)) between 1 and 100),
  entitlement text not null check (entitlement in ('premium')),
  duration_days integer,
  is_lifetime boolean not null,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((is_lifetime and duration_days is null) or (not is_lifetime and duration_days between 1 and 36500)),
  check (starts_at is null or expires_at is null or expires_at > starts_at),
  check (max_redemptions is null or redemption_count <= max_redemptions)
);
alter table public.entitlement_codes enable row level security;
revoke all on table public.entitlement_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.entitlement_codes to service_role;

create table public.entitlement_code_redemptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code_id uuid not null references public.entitlement_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique(code_id,user_id)
);
create index entitlement_code_redemptions_user_idx on public.entitlement_code_redemptions(user_id);
alter table public.entitlement_code_redemptions enable row level security;
revoke all on table public.entitlement_code_redemptions from public, anon, authenticated;
grant select, insert, update, delete on table public.entitlement_code_redemptions to service_role;

create function public.redeem_entitlement_code(p_code text, p_expected_user_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare v_user uuid := auth.uid(); v_normalized text; v_code public.entitlement_codes; v_now timestamptz := now();
begin
  if v_user is null or v_user is distinct from p_expected_user_id then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_code is null or char_length(p_code) > 100 then return 'invalid'; end if;
  v_normalized := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p_code), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_normalized) not between 6 and 64 then return 'invalid'; end if;
  select * into v_code from public.entitlement_codes
  where code_hash=pg_catalog.sha256(pg_catalog.convert_to(v_normalized,'UTF8')) for update;
  if not found then return 'invalid'; end if;
  if exists(select 1 from public.entitlement_code_redemptions r where r.code_id=v_code.id and r.user_id=v_user) then return 'already_redeemed'; end if;
  if not v_code.is_active or (v_code.expires_at is not null and v_code.expires_at<=v_now) then return 'expired'; end if;
  if v_code.starts_at is not null and v_code.starts_at>v_now then return 'invalid'; end if;
  if v_code.max_redemptions is not null and v_code.redemption_count>=v_code.max_redemptions then return 'exhausted'; end if;
  insert into public.entitlement_code_redemptions(code_id,user_id) values(v_code.id,v_user);
  insert into public.user_entitlements(user_id,entitlement,source,starts_at,expires_at,note)
  values(v_user,v_code.entitlement,'event',v_now,
    case when v_code.is_lifetime then null else v_now+pg_catalog.make_interval(days => v_code.duration_days) end,
    v_code.campaign_name);
  update public.entitlement_codes set redemption_count=redemption_count+1 where id=v_code.id;
  return 'redeemed';
end; $$;

revoke all on function public.redeem_entitlement_code(text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_entitlement_code(text,uuid) to authenticated, service_role;

commit;
