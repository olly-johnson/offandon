-- Bot OS schema delta: conversations + messages
--
-- Chat surface model: a `conversation` is a single thread between the user
-- and the Chat Skill. Each `message` belongs to one conversation, with role
-- in (user, assistant, system). System messages are reserved for future
-- tool-call turns; the engine itself injects the system prompt at runtime
-- and does NOT persist it.
--
-- voice_dna_snapshot is intentionally NOT cached on conversations. Chat is
-- a live surface and we want every reply to use the user's current Voice
-- DNA, not whatever was active when the thread started. Scripts cache the
-- snapshot because they are artifacts; chat replies are not.

begin;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table public.conversations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    title       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

comment on table  public.conversations is 'One row per chat thread. Title is auto-derived from the first user message.';
comment on column public.conversations.title is 'Short label rendered in the /chat list. Truncated to 80 chars + ellipsis.';

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table public.messages (
    id               uuid primary key default gen_random_uuid(),
    conversation_id  uuid not null references public.conversations (id) on delete cascade,
    user_id          uuid not null references auth.users (id) on delete cascade,
    role             text not null check (role in ('user', 'assistant', 'system')),
    content          text not null,
    created_at       timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

comment on table  public.messages is 'Append-only chat history. Ordered by created_at ascending within a conversation.';
comment on column public.messages.user_id is 'Denormalised owner. Lets RLS scope by auth.uid() without a join to conversations.';
comment on column public.messages.role is 'user | assistant | system. System role reserved for future tool/error turns.';

-- ---------------------------------------------------------------------------
-- updated_at trigger on conversations
--
-- The send-message action also touches conversations.updated_at so the list
-- can sort by recency. Trigger covers any direct UPDATE we forget.
-- ---------------------------------------------------------------------------
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversations force  row level security;
alter table public.messages      enable row level security;
alter table public.messages      force  row level security;

create policy conversations_select_own
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy conversations_insert_self
  on public.conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy conversations_update_own
  on public.conversations for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy on conversations. Wipes go through delete_user_data().

create policy messages_select_own
  on public.messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy messages_insert_self
  on public.messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- No UPDATE/DELETE on messages. Chat history is append-only.

-- ---------------------------------------------------------------------------
-- Explicit grants ("Automatically expose new tables" is OFF)
--
-- service_role gets all because the engine MAY want to run replies from a
-- background context later (e.g. scheduled summaries). Today every chat
-- write happens from a user JWT, but granting now avoids the same 42501
-- gotcha that bit script_batches.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.conversations to authenticated;
grant select, insert         on public.messages      to authenticated;

grant all on public.conversations to service_role;
grant all on public.messages      to service_role;

-- ---------------------------------------------------------------------------
-- Update delete_user_data to wipe chat
--
-- Order: messages (FK to conversations) -> conversations -> existing wipes.
-- The conversations FK on messages is ON DELETE CASCADE so the explicit
-- messages DELETE here is belt-and-braces but keeps the wipe auditable.
-- ---------------------------------------------------------------------------
create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if not is_service and (caller is null or caller <> target_user_id) then
    raise exception 'insufficient_privilege: caller % cannot delete user %', caller, target_user_id
      using errcode = '42501';
  end if;

  delete from public.messages       where user_id = target_user_id;
  delete from public.conversations  where user_id = target_user_id;
  delete from public.scripts        where user_id = target_user_id;
  delete from public.script_batches where user_id = target_user_id;
  delete from public.voice_dna      where user_id = target_user_id;
  delete from public.profiles       where id      = target_user_id;
  delete from auth.users            where id      = target_user_id;
end;
$$;

commit;
