begin;

-- Expo push tokens are device addresses. Clients can register/remove only their own
-- token through authenticated RPCs; they cannot list any user's tokens.
create table public.user_push_tokens (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_push_tokens_user_id_idx on public.user_push_tokens(user_id);
alter table public.user_push_tokens enable row level security;
revoke all on table public.user_push_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.user_push_tokens to service_role;

create function public.register_my_push_token(p_token text, p_platform text, p_previous_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or p_platform not in ('android', 'ios') then
    raise exception 'Invalid push token';
  end if;
  insert into public.user_push_tokens(token, user_id, platform)
  values (p_token, v_user_id, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  if p_previous_token is not null and p_previous_token <> p_token then
    delete from public.user_push_tokens where token = p_previous_token and user_id = v_user_id;
  end if;
end;
$$;
create function public.unregister_my_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  delete from public.user_push_tokens where token = p_token and user_id = v_user_id;
end;
$$;
revoke all on function public.register_my_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_my_push_token(text) from public, anon;
grant execute on function public.register_my_push_token(text, text, text) to authenticated, service_role;
grant execute on function public.unregister_my_push_token(text) to authenticated, service_role;

-- Enqueue in the authorized shared-event transaction so failed CRUD leaves no
-- delivery. Identifiers are deliberately not FKs: deleted events need a cancellation push,
-- and group/account cascades must not depend on the push queue.
create table public.together_shared_event_push_outbox (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  event_id uuid not null,
  actor_id uuid not null,
  kind text not null check (kind in ('created', 'updated', 'deleted')),
  title text not null,
  created_at timestamptz not null default now()
);
create index together_shared_event_push_outbox_actor_idx
  on public.together_shared_event_push_outbox(actor_id, created_at, id);
alter table public.together_shared_event_push_outbox enable row level security;
revoke all on table public.together_shared_event_push_outbox from public, anon, authenticated;
grant select, delete on table public.together_shared_event_push_outbox to service_role;

create function public.enqueue_together_shared_event_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.together_shared_event_push_outbox(space_id, event_id, actor_id, kind, title)
    values (old.space_id, old.id, v_actor, 'deleted', old.title);
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if (old.title, old.starts_at, old.ends_at, old.memo)
       is not distinct from (new.title, new.starts_at, new.ends_at, new.memo) then
      return new;
    end if;
    insert into public.together_shared_event_push_outbox(space_id, event_id, actor_id, kind, title)
    values (new.space_id, new.id, v_actor, 'updated', new.title);
    return new;
  end if;
  insert into public.together_shared_event_push_outbox(space_id, event_id, actor_id, kind, title)
  values (new.space_id, new.id, v_actor, 'created', new.title);
  return new;
exception when others then
  -- Push is best effort; queue failures must never roll back event CRUD or a
  -- cascading group/account delete. No token or event data is logged here.
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.enqueue_together_shared_event_push() from public, anon, authenticated;
create trigger together_shared_event_push_enqueue
  after insert or update or delete on public.shared_events
  for each row execute function public.enqueue_together_shared_event_push();

-- Service-role only. Claim-and-delete before sending gives at-most-once dispatch
-- across concurrent function calls. Only current active members receive tokens.
create function public.claim_together_shared_event_push(p_actor uuid)
returns table (
  delivery_id uuid, space_id uuid, event_id uuid, kind text, title text,
  actor_name text, recipient_user_id uuid, token text
) language sql security definer set search_path = '' as $$
  with claimed as (
    delete from public.together_shared_event_push_outbox as o
    where o.id in (
      select q.id from public.together_shared_event_push_outbox as q
      where q.actor_id = p_actor
      order by q.created_at, q.id
      limit 20 for update skip locked
    )
    returning o.id, o.space_id, o.event_id, o.actor_id, o.kind, o.title
  )
  select distinct c.id, c.space_id, c.event_id, c.kind, c.title,
    coalesce(nullif(trim(p.display_name), ''), '함께 멤버') as actor_name,
    m.user_id, t.token
  from claimed as c
  join public.together_memberships as m
    on m.space_id = c.space_id and m.status = 'active' and m.user_id <> c.actor_id
  join public.user_push_tokens as t on t.user_id = m.user_id
  left join public.profiles as p on p.id = c.actor_id
  where exists (
    select 1 from public.together_memberships as actor_membership
    where actor_membership.space_id = c.space_id
      and actor_membership.user_id = c.actor_id
      and actor_membership.status = 'active'
  );
$$;
revoke all on function public.claim_together_shared_event_push(uuid) from public, anon, authenticated;
grant execute on function public.claim_together_shared_event_push(uuid) to service_role;

commit;
