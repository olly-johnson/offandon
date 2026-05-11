-- Bot OS schema delta: user_memories
--
-- Lightweight structured memory the assistant builds up over the course of
-- many chat conversations. Separate from Voice DNA on purpose: DNA is a
-- stable identity artifact generated once at onboarding (tone, pillars,
-- persona); memory is incremental state that changes as the creator works.
-- Coupling them would mean regenerating identity every time a new fact
-- lands, which is wrong.
--
-- A row is one fact. Categories are deliberately coarse so the surface
-- builder can subset what it pulls into a prompt:
--   ongoing_project  the creator's current launches, builds, in-flights
--   creator_context  business model, collaborators, tools, audience details
--   preference       stylistic preferences beyond DNA (specific dislikes,
--                    favoured metaphors, swearing thresholds)
--   recent_topic     short-shelf-life mentions; pruned hard at extraction time
--
-- priority is 1..5; higher means more load-bearing. The prompt builder
-- pulls top-N by priority desc, created_at desc and clips the rest.

begin;

create table public.user_memories (
    id                     uuid primary key default gen_random_uuid(),
    user_id                uuid not null references auth.users (id) on delete cascade,
    fact                   text not null,
    category               text not null
      check (category in ('ongoing_project', 'creator_context', 'preference', 'recent_topic')),
    priority               smallint not null default 3 check (priority between 1 and 5),
    source_conversation_id uuid references public.conversations (id) on delete set null,
    created_at             timestamptz not null default now(),
    constraint user_memories_fact_not_blank check (length(btrim(fact)) > 0)
);

create index user_memories_user_id_priority_idx
  on public.user_memories (user_id, priority desc, created_at desc);

comment on table  public.user_memories is 'Structured Haiku-extracted facts about the creator. Read at prompt-build time, capped per surface.';
comment on column public.user_memories.priority is '1..5; higher = more load-bearing in prompts.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_memories enable row level security;
alter table public.user_memories force  row level security;

create policy user_memories_select_own
  on public.user_memories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_memories_insert_self
  on public.user_memories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_memories_update_own
  on public.user_memories for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_memories_delete_own
  on public.user_memories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.user_memories to authenticated;
grant all on public.user_memories to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe memories
--
-- Order: user_memories (FK to conversations is SET NULL so survives a chat
-- wipe) -> ideas -> messages -> conversations -> rest.
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

  delete from public.user_memories  where user_id = target_user_id;
  delete from public.ideas          where user_id = target_user_id;
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
