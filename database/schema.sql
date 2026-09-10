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
  generation_user_saved boolean not null default false,
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
create index salpe_messages_conversation_user on public.salpe_messages(conversation_id,user_id);

alter table public.salpe_conversations enable row level security;
alter table public.salpe_messages enable row level security;
revoke all on public.salpe_conversations, public.salpe_messages from public, anon, authenticated;
grant select on public.salpe_conversations, public.salpe_messages to authenticated;
grant all on public.salpe_conversations, public.salpe_messages to service_role;

create policy salpe_conversations_read on public.salpe_conversations for select to authenticated
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

create function salpe_private.consume_quota(p_scope text)
returns boolean
language plpgsql
volatile
security definer
set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_key text;
  v_limit integer;
  v_window integer;
  v_window_start timestamptz;
  v_hits integer;
  v_storage_key text;
begin
  if v_uid is null or not salpe_private.session_active() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  case p_scope
    when 'chat_minute' then v_key := 'chat-minute:' || v_uid::text; v_limit := 12; v_window := 60;
    when 'chat_day' then v_key := 'chat-day:' || v_uid::text; v_limit := 100; v_window := 86400;
    when 'chat_global_day' then v_key := 'chat-global-day:all'; v_limit := 1000; v_window := 86400;
    when 'new_conversations' then v_key := 'new-conversations:' || v_uid::text; v_limit := 30; v_window := 86400;
    when 'delete' then v_key := 'delete:' || v_uid::text; v_limit := 30; v_window := 60;
    else raise exception 'Unknown quota scope' using errcode = '22023';
  end case;

  v_storage_key := md5(v_key) || md5('salpe:' || v_key);
  v_window_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_window) * v_window);
  delete from salpe_private.rate_limits where expires_at < clock_timestamp();
  insert into salpe_private.rate_limits(key,window_start,expires_at,hits)
    values(v_storage_key,v_window_start,v_window_start + make_interval(secs => v_window),1)
  on conflict(key,window_start) do update set hits = salpe_private.rate_limits.hits + 1
    where salpe_private.rate_limits.hits < v_limit
  returning hits into v_hits;
  return v_hits is not null;
end;
$$;
revoke all on function salpe_private.consume_quota(text) from public, anon, authenticated;
grant execute on function salpe_private.consume_quota(text) to authenticated;

create function public.salpe_consume_quota(p_scope text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select salpe_private.consume_quota(p_scope);
$$;
revoke all on function public.salpe_consume_quota(text) from public, anon;
grant execute on function public.salpe_consume_quota(text) to authenticated;

create function salpe_private.begin_generation(p_conversation uuid,p_title text,p_model text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation uuid;
  v_locked uuid;
  v_lease uuid := gen_random_uuid();
begin
  if v_uid is null or not salpe_private.session_active() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_model is null or char_length(p_model) < 1 or char_length(p_model) > 160 then
    raise exception 'Invalid model' using errcode = '22023';
  end if;
  if p_title is null or char_length(p_title) < 1 or char_length(p_title) > 100 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;

  if not salpe_private.consume_quota('chat_minute')
     or not salpe_private.consume_quota('chat_day')
     or not salpe_private.consume_quota('chat_global_day') then
    return jsonb_build_object('status','rate_limited');
  end if;

  if p_conversation is null then
    if not salpe_private.consume_quota('new_conversations') then
      return jsonb_build_object('status','rate_limited');
    end if;
    insert into public.salpe_conversations(user_id,title,model)
      values(v_uid,p_title,p_model) returning id into v_conversation;
  else
    select id into v_conversation from public.salpe_conversations
      where id = p_conversation and user_id = v_uid;
    if v_conversation is null then
      return jsonb_build_object('status','not_found');
    end if;
  end if;

  update public.salpe_conversations
    set generation_id = v_lease,
        generation_until = clock_timestamp() + interval '150 seconds',
        generation_user_saved = false,
        model = p_model,
        updated_at = clock_timestamp()
    where id = v_conversation and user_id = v_uid
      and (generation_until is null or generation_until < clock_timestamp())
    returning id into v_locked;

  if v_locked is null then return jsonb_build_object('status','locked'); end if;
  return jsonb_build_object('status','ok','conversation_id',v_conversation,'lease_id',v_lease);
end;
$$;
revoke all on function salpe_private.begin_generation(uuid,text,text) from public, anon, authenticated;
grant execute on function salpe_private.begin_generation(uuid,text,text) to authenticated;

create function public.salpe_begin_generation(p_conversation uuid,p_title text,p_model text)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select salpe_private.begin_generation(p_conversation,p_title,p_model);
$$;
revoke all on function public.salpe_begin_generation(uuid,text,text) from public, anon;
grant execute on function public.salpe_begin_generation(uuid,text,text) to authenticated;

create function salpe_private.record_user_message(p_conversation uuid,p_lease uuid,p_message text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_found uuid;
begin
  if v_uid is null or not salpe_private.session_active() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_message is null or char_length(p_message) < 1 or char_length(p_message) > 12000 then
    raise exception 'Invalid message' using errcode = '22023';
  end if;

  update public.salpe_conversations
    set generation_user_saved = true, updated_at = clock_timestamp()
    where id = p_conversation and user_id = v_uid
      and generation_id = p_lease and generation_until > clock_timestamp()
      and generation_user_saved = false
    returning id into v_found;
  if v_found is null then return false; end if;

  insert into public.salpe_messages(conversation_id,user_id,role,content)
    values(p_conversation,v_uid,'user',p_message);
  return true;
end;
$$;
revoke all on function salpe_private.record_user_message(uuid,uuid,text) from public, anon, authenticated;
grant execute on function salpe_private.record_user_message(uuid,uuid,text) to authenticated;

create function public.salpe_record_user_message(p_conversation uuid,p_lease uuid,p_message text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select salpe_private.record_user_message(p_conversation,p_lease,p_message);
$$;
revoke all on function public.salpe_record_user_message(uuid,uuid,text) from public, anon;
grant execute on function public.salpe_record_user_message(uuid,uuid,text) to authenticated;

create function salpe_private.finish_generation(p_conversation uuid,p_lease uuid,p_answer text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_found uuid;
begin
  if v_uid is null or not salpe_private.session_active() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_answer is null or char_length(p_answer) < 1 or char_length(p_answer) > 64000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;

  select id into v_found from public.salpe_conversations
    where id = p_conversation and user_id = v_uid
      and generation_id = p_lease and generation_user_saved = true;
  if v_found is null then return false; end if;

  insert into public.salpe_messages(conversation_id,user_id,role,content)
    values(p_conversation,v_uid,'assistant',p_answer);
  update public.salpe_conversations
    set generation_id = null, generation_until = null,
        generation_user_saved = false, updated_at = clock_timestamp()
    where id = p_conversation and user_id = v_uid and generation_id = p_lease;
  return true;
end;
$$;
revoke all on function salpe_private.finish_generation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function salpe_private.finish_generation(uuid,uuid,text) to authenticated;

create function public.salpe_finish_generation(p_conversation uuid,p_lease uuid,p_answer text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select salpe_private.finish_generation(p_conversation,p_lease,p_answer);
$$;
revoke all on function public.salpe_finish_generation(uuid,uuid,text) from public, anon;
grant execute on function public.salpe_finish_generation(uuid,uuid,text) to authenticated;

create function salpe_private.release_generation(p_conversation uuid,p_lease uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_found uuid;
begin
  if v_uid is null or not salpe_private.session_active() then return false; end if;
  update public.salpe_conversations
    set generation_id = null, generation_until = null, generation_user_saved = false
    where id = p_conversation and user_id = v_uid and generation_id = p_lease
    returning id into v_found;
  return v_found is not null;
end;
$$;
revoke all on function salpe_private.release_generation(uuid,uuid) from public, anon, authenticated;
grant execute on function salpe_private.release_generation(uuid,uuid) to authenticated;

create function public.salpe_release_generation(p_conversation uuid,p_lease uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select salpe_private.release_generation(p_conversation,p_lease);
$$;
revoke all on function public.salpe_release_generation(uuid,uuid) from public, anon;
grant execute on function public.salpe_release_generation(uuid,uuid) to authenticated;

create function salpe_private.delete_conversation(p_conversation uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_found uuid;
begin
  if v_uid is null or not salpe_private.session_active() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if not salpe_private.consume_quota('delete') then return false; end if;
  delete from public.salpe_conversations
    where id = p_conversation and user_id = v_uid
    returning id into v_found;
  return v_found is not null;
end;
$$;
revoke all on function salpe_private.delete_conversation(uuid) from public, anon, authenticated;
grant execute on function salpe_private.delete_conversation(uuid) to authenticated;

create function public.salpe_delete_conversation(p_conversation uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select salpe_private.delete_conversation(p_conversation);
$$;
revoke all on function public.salpe_delete_conversation(uuid) from public, anon;
grant execute on function public.salpe_delete_conversation(uuid) to authenticated;

commit;
