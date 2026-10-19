create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  category text not null
    check (category in ('bug', 'ux', 'feature', 'design', 'other')),

  screen text not null,

  message text not null
    check (char_length(message) between 1 and 1000),

  wants_reply boolean not null default false,
  contact text,

  app_version text,
  version_code text,
  platform text,
  device_model text,
  os_version text,

  status text not null default 'new'
    check (status in ('new', 'reviewing', 'planned', 'fixed', 'closed')),

  created_at timestamptz not null default now()
);

alter table public.beta_feedback enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'beta_feedback'
      and policyname = 'Users can submit own feedback'
  ) then
    create policy "Users can submit own feedback"
    on public.beta_feedback
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'beta_feedback'
      and policyname = 'Users can read own feedback'
  ) then
    create policy "Users can read own feedback"
    on public.beta_feedback
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

grant insert, select on table public.beta_feedback to authenticated;