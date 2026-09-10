-- Salpe AI schema. Run once in a dedicated Supabase project.
-- Authentication tables and roles are supplied by Supabase.
begin;
create schema if not exists salpe_private;
revoke all on schema salpe_private from public, anon, authenticated;
grant usage on schema salpe_private to authenticated, service_role;

create function salpe_private.session_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id::text = (select auth.jwt())->>'session_id'
      and s.user_id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;
revoke all on function salpe_private.session_active() from public, anon, authenticated;
grant execute on function salpe_private.session_active() to authenticated;

create function public.salpe_session_active() returns boolean
language sql stable security invoker set search_path = '' as $$
  select salpe_private.session_active();
$$;
revoke all on function public.salpe_session_active() from public, anon;
grant execute on function public.salpe_session_active() to authenticated;

create table public.salpe_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  model text not null check (char_length(model) between 1 and 160),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  generation_id uuid,
  generation_until timestamptz,
  unique(id,user_id)
);
create index salpe_conversations_user_updated on public.salpe_conversations(user_id,updated_at desc);
create table public.salpe_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 64000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(conversation_id,user_id) references public.salpe_conversations(id,user_id) on delete cascade
);
create index salpe_messages_conversation on public.salpe_messages(conversation_id,created_at);
create index salpe_messages_user on public.salpe_messages(user_id);
alter table public.salpe_conversations enable row level security;
alter table public.salpe_messages enable row level security;
revoke all on public.salpe_conversations, public.salpe_messages from public, anon, authenticated;
grant select,delete on public.salpe_conversations to authenticated;
grant select on public.salpe_messages to authenticated;
grant all on public.salpe_conversations, public.salpe_messages to service_role;
-- All inserts and updates pass through the rate-limited application server.
-- Browser-held user tokens cannot bypass quotas with direct REST writes.
create policy salpe_conversations_read on public.salpe_conversations for select to authenticated
  using (user_id = (select auth.uid()) and (select salpe_private.session_active()));
create policy salpe_conversations_delete on public.salpe_conversations for delete to authenticated
  using (user_id = (select auth.uid()) and (select salpe_private.session_active()));
create policy salpe_messages_read on public.salpe_messages for select to authenticated
  using (user_id = (select auth.uid()) and (select salpe_private.session_active()));

create table salpe_private.rate_limits (
  key text not null check (char_length(key) = 64),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  hits integer not null check(hits > 0),
  primary key(key,window_start)
);
create index salpe_rate_expiry on salpe_private.rate_limits(expires_at);
alter table salpe_private.rate_limits enable row level security;
revoke all on salpe_private.rate_limits from public,anon,authenticated;
grant all on salpe_private.rate_limits to service_role;
create function public.salpe_consume_quota(p_key text,p_limit integer,p_window integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_window timestamptz; current_hits integer;
begin
  if p_limit < 1 or p_limit > 100000 or p_window < 1 or p_window > 86400 or length(p_key) <> 64 then
    raise exception 'Invalid quota configuration';
  end if;
  current_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window) * p_window);
  delete from salpe_private.rate_limits where expires_at < clock_timestamp();
  insert into salpe_private.rate_limits(key,window_start,expires_at,hits)
    values(p_key,current_window,current_window + make_interval(secs => p_window),1)
  on conflict(key,window_start) do update set hits = salpe_private.rate_limits.hits + 1
    where salpe_private.rate_limits.hits < p_limit
  returning hits into current_hits;
  return current_hits is not null;
end;
$$;
revoke all on function public.salpe_consume_quota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.salpe_consume_quota(text,integer,integer) to service_role;
commit;
