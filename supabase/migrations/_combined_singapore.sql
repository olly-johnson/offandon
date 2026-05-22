-- =============================================================================
-- Bot OS - combined migration bundle for Singapore region cutover
-- Generated 2026-05-16 11:23:35
--
-- Run this entire file ONCE against a fresh Supabase project via:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Each section below is a verbatim copy of one migration in supabase/migrations,
-- in filename (timestamp) order. Every migration wraps itself in begin/commit,
-- so a failure inside one section rolls back THAT section only.
--
-- Pre-flight (do these BEFORE running):
--   1. Project region is ap-southeast-1 (Singapore)
--   2. Settings -> API: "Automatically expose new tables" = OFF
--   3. Settings -> API: Data API enabled
--   4. Automatic RLS = ON (safe; this script also explicitly enables RLS)
-- =============================================================================

-- =============================================================================
-- 20260509000000_init.sql
-- =============================================================================

-- Bot OS — initial schema
-- Adds: profiles, scripts, voice_dna, RLS policies, replace_voice_dna RPC,
--       and GDPR hard-delete function.
--
-- Conventions:
--   * Every user-owned table has user_id (or id, for profiles) referencing
--     auth.users(id) ON DELETE CASCADE. The cascade is a defense-in-depth
--     fallback; the canonical wipe path is delete_user_data().
--   * RLS is ENABLED and FORCED on every user-owned table — table owners
--     are also subject to policies, preventing accidental bypass.
--   * Policies require both authenticated role AND user_id = auth.uid().
--   * Supabase project setting "Automatically expose new tables" is OFF, so
--     this migration grants table privileges to `authenticated` explicitly.
--     New tables added later MUST follow the same pattern, otherwise RLS
--     policies will pass and the underlying GRANT will deny with 42501.

begin;

-- pgcrypto: gen_random_uuid().  citext: case-insensitive handle uniqueness.
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
    id                         uuid primary key references auth.users (id) on delete cascade,
    handle                     citext unique,
    display_name               text,
    data_policy_accepted       boolean not null default false,
    data_policy_accepted_at    timestamptz,
    created_at                 timestamptz not null default now(),
    updated_at                 timestamptz not null default now(),
    constraint data_policy_timestamp_consistent
      check ((data_policy_accepted = false and data_policy_accepted_at is null)
          or (data_policy_accepted = true  and data_policy_accepted_at is not null))
);

comment on table  public.profiles is 'One row per authenticated user. id mirrors auth.users.id.';
comment on column public.profiles.data_policy_accepted is 'GDPR: must be true before any content is generated for this user.';

-- ---------------------------------------------------------------------------
-- scripts
-- ---------------------------------------------------------------------------
create table public.scripts (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references auth.users (id) on delete cascade,
    title               text,
    hook                text,
    body                text not null,
    voice_dna_snapshot  jsonb,
    source              text not null default 'generated'
                          check (source in ('generated', 'rewrite', 'imported')),
    status              text not null default 'draft'
                          check (status in ('draft', 'published', 'archived')),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index scripts_user_id_created_at_idx
  on public.scripts (user_id, created_at desc);

comment on table  public.scripts is 'Generated and user-edited scripts owned by a single user.';
comment on column public.scripts.voice_dna_snapshot is 'Frozen Voice DNA used at generation time — required for reproducibility.';

-- ---------------------------------------------------------------------------
-- voice_dna
--
-- Append-only history of distilled Voice DNA profiles, one user-row per
-- regeneration. The active row is the one with superseded_at IS NULL.
-- Old rows are kept (never deleted via app code) so we can audit drift in
-- voice over time. The only path that wipes them is delete_user_data().
--
-- Atomicity: writes go through replace_voice_dna() which marks the prior
-- active row superseded and inserts the new one in one transaction.
-- ---------------------------------------------------------------------------
create table public.voice_dna (
    id                          uuid primary key default gen_random_uuid(),
    user_id                     uuid not null references auth.users (id) on delete cascade,
    dna                         jsonb not null,
    source_answers              jsonb not null,
    source_questionnaire_hash   text not null,
    generated_at                timestamptz not null default now(),
    superseded_at               timestamptz
);

-- Exactly one active Voice DNA row per user. Functionally equivalent to
-- `EXCLUDE USING btree (user_id WITH =) WHERE (superseded_at IS NULL)`.
create unique index voice_dna_one_active_per_user
  on public.voice_dna (user_id)
  where superseded_at is null;

-- Lookup the user's history fast.
create index voice_dna_user_id_generated_at_idx
  on public.voice_dna (user_id, generated_at desc);

comment on table  public.voice_dna is 'Append-only Voice DNA history. Active row has superseded_at IS NULL.';
comment on column public.voice_dna.dna is 'Full VoiceDNA object as produced by the Voice Engine.';
comment on column public.voice_dna.source_answers is 'OnboardingAnswers used to generate this row — needed for regeneration audits.';
comment on column public.voice_dna.source_questionnaire_hash is 'SHA-256 of the answers JSON; mirrors VoiceDNA.source_questionnaire_hash.';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger scripts_set_updated_at
  before update on public.scripts
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.profiles  force  row level security;
alter table public.scripts   enable row level security;
alter table public.scripts   force  row level security;
alter table public.voice_dna enable row level security;
alter table public.voice_dna force  row level security;

-- profiles: a user can only see, insert, and update their own profile row.
-- Deletes are intentionally not exposed via RLS — go through delete_user_data().
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using      ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- scripts: full CRUD scoped to user_id = auth.uid().
create policy scripts_select_own
  on public.scripts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy scripts_insert_self
  on public.scripts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy scripts_update_own
  on public.scripts for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy scripts_delete_own
  on public.scripts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- voice_dna: select/insert/update of own rows. Update is needed by
-- replace_voice_dna() to mark prior rows superseded. No DELETE policy —
-- the only path that removes rows is delete_user_data().
create policy voice_dna_select_own
  on public.voice_dna for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy voice_dna_insert_self
  on public.voice_dna for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy voice_dna_update_own
  on public.voice_dna for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Explicit grants (Data API setting: "Automatically expose new tables" = off)
--
-- profiles + voice_dna: no DELETE grant — wipe path is delete_user_data().
-- scripts: full DML; users may delete their own drafts.
-- ---------------------------------------------------------------------------
grant select, insert, update         on public.profiles  to authenticated;
grant select, insert, update, delete on public.scripts   to authenticated;
grant select, insert, update         on public.voice_dna to authenticated;

-- ---------------------------------------------------------------------------
-- replace_voice_dna RPC
--
-- Atomically supersedes the caller's currently active Voice DNA row and
-- inserts a new one. Runs as the caller (SECURITY INVOKER) so the table's
-- RLS policies still apply — the function adds atomicity, not authority.
--
-- The partial unique index voice_dna_one_active_per_user guarantees no
-- caller can have two active rows at once. Concurrent calls for the same
-- user serialise on the row lock from the UPDATE; the loser sees a
-- unique-violation it can retry.
-- ---------------------------------------------------------------------------
create or replace function public.replace_voice_dna(
  p_dna jsonb,
  p_source_answers jsonb,
  p_source_questionnaire_hash text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  update public.voice_dna
     set superseded_at = now()
   where user_id = caller
     and superseded_at is null;

  insert into public.voice_dna (user_id, dna, source_answers, source_questionnaire_hash)
       values (caller, p_dna, p_source_answers, p_source_questionnaire_hash);
end;
$$;

revoke all     on function public.replace_voice_dna(jsonb, jsonb, text) from public, anon;
grant  execute on function public.replace_voice_dna(jsonb, jsonb, text) to authenticated;

comment on function public.replace_voice_dna(jsonb, jsonb, text) is
  'Atomically supersede the caller''s active Voice DNA and insert a new one.';

-- ---------------------------------------------------------------------------
-- GDPR hard-delete
-- ---------------------------------------------------------------------------
-- Erases every row owned by a user across all user-scoped tables, plus the
-- auth.users row itself. SECURITY DEFINER lets the function reach auth.users,
-- which is owned by supabase_auth_admin and not RLS-modifiable by end users.
--
-- Authorisation contract (enforced inside the function, not via RLS):
--   * The caller must be the target user (auth.uid() = target_user_id), OR
--   * The caller must hold the service_role (admin-initiated wipes).
-- Anything else raises insufficient_privilege.
--
-- When new user-scoped tables (vectors, transcripts, etc.) are added, append
-- their delete statements to the body of this function in the same migration
-- that creates them. The auth.users delete at the end will cascade as a
-- backstop, but explicit deletes here keep the wipe auditable.
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

  delete from public.voice_dna where user_id = target_user_id;
  delete from public.scripts   where user_id = target_user_id;
  delete from public.profiles  where id      = target_user_id;
  delete from auth.users       where id      = target_user_id;
end;
$$;

revoke all     on function public.delete_user_data(uuid) from public, anon;
grant  execute on function public.delete_user_data(uuid) to authenticated, service_role;

comment on function public.delete_user_data(uuid) is
  'GDPR hard-delete. Caller must be the target user or service_role. Extend with new tables as they are added.';

commit;

-- =============================================================================
-- 20260509000001_script_batches.sql
-- =============================================================================

-- Bot OS schema delta: script_batches + scripts.batch_id
--
-- Background-job model: a "batch" is the request to generate N scripts. The
-- Inngest worker progresses it through pending -> running -> complete | failed.
-- Individual `scripts` rows are created by the worker and linked back via
-- `batch_id`. Without a successful batch there are no scripts.
--
-- This migration is purely additive over 20260509000000_init.sql, so it can
-- be applied without touching any existing rows.

begin;

-- ---------------------------------------------------------------------------
-- script_batches
-- ---------------------------------------------------------------------------
create table public.script_batches (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid not null references auth.users (id) on delete cascade,
    status                text not null default 'pending'
                            check (status in ('pending', 'running', 'complete', 'failed')),
    voice_dna_snapshot    jsonb not null,
    count_requested       int not null default 7
                            check (count_requested between 1 and 30),
    count_generated       int not null default 0
                            check (count_generated >= 0),
    failure_reason        text,
    created_at            timestamptz not null default now(),
    completed_at          timestamptz
);

create index script_batches_user_id_created_at_idx
  on public.script_batches (user_id, created_at desc);

comment on table  public.script_batches is 'One row per "generate N scripts" request. Status tracks the Inngest job lifecycle.';
comment on column public.script_batches.voice_dna_snapshot is 'Frozen Voice DNA at request time. Reproducibility + drift audit.';
comment on column public.script_batches.failure_reason is 'Surfaced in /scripts when status = failed. Truncate to a human-readable message before storing.';

-- ---------------------------------------------------------------------------
-- scripts.batch_id (additive)
--
-- ON DELETE SET NULL: deleting a batch (only via delete_user_data) leaves
-- the script rows in place momentarily; delete_user_data immediately wipes
-- the script rows in the same transaction, so this never matters in
-- practice. The SET NULL is just a belt-and-braces choice over CASCADE so
-- a misbehaving direct DELETE on script_batches cannot inadvertently nuke
-- script content.
-- ---------------------------------------------------------------------------
alter table public.scripts
  add column batch_id uuid references public.script_batches (id) on delete set null;

create index scripts_batch_id_idx on public.scripts (batch_id);

comment on column public.scripts.batch_id is 'FK to the script_batches row that produced this script. Null = manually created.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.script_batches enable row level security;
alter table public.script_batches force  row level security;

create policy script_batches_select_own
  on public.script_batches for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy script_batches_insert_self
  on public.script_batches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy script_batches_update_own
  on public.script_batches for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy. Wipes go through delete_user_data().

-- ---------------------------------------------------------------------------
-- Explicit grants ("Automatically expose new tables" is OFF)
--
-- service_role bypasses RLS but NOT GRANTs. Without an explicit grant the
-- Inngest worker (which uses the service-role client) gets 42501 permission
-- denied before RLS even runs. We retroactively backfill the same grants
-- for the older tables in 20260509000002_service_role_grants.sql.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.script_batches to authenticated;
grant all                    on public.script_batches to service_role;

-- ---------------------------------------------------------------------------
-- Update delete_user_data to wipe script_batches
--
-- Order: delete child rows first (scripts), then their parent (script_batches),
-- then voice_dna, then profiles, then auth.users. The auth.users delete
-- cascades as a backstop, but explicit deletes here keep the wipe auditable.
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

  delete from public.scripts        where user_id = target_user_id;
  delete from public.script_batches where user_id = target_user_id;
  delete from public.voice_dna      where user_id = target_user_id;
  delete from public.profiles       where id      = target_user_id;
  delete from auth.users            where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260509000002_service_role_grants.sql
-- =============================================================================

-- Backfill service_role GRANTs on Phase 0 / Phase 1 tables.
--
-- The Phase 0 init migration (20260509000000_init.sql) granted only
-- `authenticated` because the only Supabase clients in scope at that point
-- used the user JWT. Phase 2 introduced the Inngest worker, which runs
-- as `service_role` and therefore needs explicit table grants. Without
-- these the worker fails with 42501 permission denied even though
-- service_role bypasses RLS.
--
-- Idempotent: GRANT is a no-op when the privilege is already held.

begin;

grant all on public.profiles  to service_role;
grant all on public.scripts   to service_role;
grant all on public.voice_dna to service_role;

commit;

-- =============================================================================
-- 20260510000001_chat.sql
-- =============================================================================

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

-- =============================================================================
-- 20260511000000_ideas.sql
-- =============================================================================

-- Bot OS schema delta: ideas
--
-- "Ideas Bank": short, free-text ideas captured during chat (via the
-- save_idea tool the assistant can call) or saved manually from the UI.
-- An idea is the input to the Script Wizard; the wizard's step 1 can
-- pre-fill from a saved idea, turning the bank into a real funnel.
--
-- Source linkage:
--   source = 'chat'   -> captured via tool-use during a conversation.
--                        conversation_id and message_id point at the turn
--                        that triggered the capture.
--   source = 'manual' -> typed in by the user. Both FKs are NULL.
--
-- Both FKs are SET NULL on delete because we keep the idea even if the
-- originating chat is wiped (e.g. user clears chat history). The wipe path
-- in delete_user_data still drops ideas explicitly.

begin;

create table public.ideas (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    content          text not null,
    pillar           text,
    source           text not null check (source in ('chat', 'manual')),
    conversation_id  uuid references public.conversations (id) on delete set null,
    message_id       uuid references public.messages      (id) on delete set null,
    created_at       timestamptz not null default now(),
    constraint ideas_content_not_blank check (length(btrim(content)) > 0)
);

create index ideas_user_id_created_at_idx
  on public.ideas (user_id, created_at desc);

comment on table  public.ideas is 'One row per saved idea. Drains into the Script Wizard step 1.';
comment on column public.ideas.source is 'chat (via tool-use) | manual (typed in UI).';
comment on column public.ideas.pillar is 'Optional content pillar the assistant tagged. May not match any current pillar name.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ideas enable row level security;
alter table public.ideas force  row level security;

create policy ideas_select_own
  on public.ideas for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy ideas_insert_self
  on public.ideas for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy ideas_update_own
  on public.ideas for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy ideas_delete_own
  on public.ideas for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.ideas to authenticated;
grant all on public.ideas to service_role;

-- ---------------------------------------------------------------------------
-- Update delete_user_data to wipe ideas
--
-- Order: ideas (FK to conversations/messages) -> messages -> conversations
-- -> rest. ideas FKs are SET NULL so a stale row would survive a conversation
-- delete, hence the explicit wipe here.
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

-- =============================================================================
-- 20260511000001_user_memories.sql
-- =============================================================================

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

-- =============================================================================
-- 20260511000002_user_methodology.sql
-- =============================================================================

-- Bot OS schema delta: user_methodology
--
-- Per-user methodology overlay (BO-036). Stacks on top of the house
-- methodology (docs/methodology/01-house.md + per-surface slices) and
-- the creator's Voice DNA. Examples a creator might write:
--   "Never use the word 'unlock'. I do not 'unlock' anything."
--   "When suggesting hooks for the Operator Frameworks pillar, prefer
--    specific dollar amounts. No vague 'predictable revenue' framing."
--   "Always prefer running metaphors over war metaphors."
--
-- One row per user (user_id is PRIMARY KEY) so the upsert path is
-- trivial and there's no version churn here. Voice DNA already handles
-- versioned identity drift; this surface is a simple living document.
--
-- The content column is plain text; the prompt builder renders it
-- verbatim wrapped in a marked block. We rely on the existing anti-slop
-- validator (run on engine outputs) to catch any sneaky em-dashes the
-- creator pastes in. We do NOT validate the overlay itself; trust the
-- creator to write what they want.

begin;

create table public.user_methodology (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    content    text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.user_methodology is 'Per-user methodology overlay. One row per user; stacks on top of the house methodology in every surface prompt.';
comment on column public.user_methodology.content is 'Plain text. Rendered verbatim into the system prompt of chat, hook, IMF, and script engines.';

create trigger user_methodology_set_updated_at
  before update on public.user_methodology
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_methodology enable row level security;
alter table public.user_methodology force  row level security;

create policy user_methodology_select_own
  on public.user_methodology for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_methodology_insert_self
  on public.user_methodology for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_methodology_update_own
  on public.user_methodology for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy; creators clear by emptying the textarea (UPDATE).
-- Wipe path: delete_user_data.

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update on public.user_methodology to authenticated;
grant all on public.user_methodology to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe the overlay
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

  delete from public.user_methodology where user_id = target_user_id;
  delete from public.user_memories    where user_id = target_user_id;
  delete from public.ideas            where user_id = target_user_id;
  delete from public.messages         where user_id = target_user_id;
  delete from public.conversations    where user_id = target_user_id;
  delete from public.scripts          where user_id = target_user_id;
  delete from public.script_batches   where user_id = target_user_id;
  delete from public.voice_dna        where user_id = target_user_id;
  delete from public.profiles         where id      = target_user_id;
  delete from auth.users              where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260511000003_instagram.sql
-- =============================================================================

-- Bot OS schema delta: Instagram integration (BO-005)
--
-- Two tables:
--   instagram_connections  one row per user; the IG access token + the
--                          last-known top-level account stats
--                          (followers_count, media_count). Long-lived
--                          tokens last 60 days; the refresh job updates
--                          last_synced_at as it goes.
--   instagram_media        one row per published post / reel. Re-synced
--                          nightly + on manual refresh. Primary key is the
--                          IG media id (string) so upserts are trivial.
--
-- Security note: the access token is stored as TEXT in plaintext. For a
-- single-user MVP behind RLS this is acceptable; the real fix is
-- pgsodium / Supabase Vault encryption-at-rest, which is a follow-up.
-- The token gives full read+insights access to one Instagram account;
-- treat the DB rows accordingly.
--
-- Sync model is replace-by-upsert: every refresh fetches the latest N
-- media + insights and upserts on instagram_media.id. We never DELETE
-- rows here; old posts that fall out of the recent N just stop being
-- updated. A future cleanup job can prune anything not seen in 90 days.

begin;

-- ---------------------------------------------------------------------------
-- instagram_connections
-- ---------------------------------------------------------------------------
create table public.instagram_connections (
    user_id          uuid primary key references auth.users (id) on delete cascade,
    access_token     text not null,
    ig_user_id       text not null,
    ig_username      text,
    followers_count  integer,
    follows_count    integer,
    media_count      integer,
    last_synced_at   timestamptz,
    last_sync_error  text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint instagram_connections_token_not_blank
      check (length(btrim(access_token)) > 0),
    constraint instagram_connections_ig_user_id_not_blank
      check (length(btrim(ig_user_id)) > 0)
);

comment on table  public.instagram_connections is 'One row per user; their Instagram Graph API connection + last-known top-level stats.';
comment on column public.instagram_connections.access_token is 'Long-lived token. Plaintext for now; future move to pgsodium / Vault.';
comment on column public.instagram_connections.last_synced_at is 'Null until the first successful sync. Drives the 24h refresh cache.';
comment on column public.instagram_connections.last_sync_error is 'Last error message if the most recent sync failed. Cleared on next success.';

create trigger instagram_connections_set_updated_at
  before update on public.instagram_connections
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- instagram_media
-- ---------------------------------------------------------------------------
create table public.instagram_media (
    id              text primary key,
    user_id         uuid not null references auth.users (id) on delete cascade,
    media_type      text not null check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REELS')),
    caption         text,
    permalink       text,
    media_url       text,
    thumbnail_url   text,
    posted_at       timestamptz,
    like_count      integer,
    comments_count  integer,
    reach           integer,
    plays           integer,
    saved           integer,
    shares          integer,
    synced_at       timestamptz not null default now()
);

create index instagram_media_user_id_posted_at_idx
  on public.instagram_media (user_id, posted_at desc nulls last);

comment on table  public.instagram_media is 'One row per published IG post / reel. Upserted on every sync. Old rows are not pruned.';
comment on column public.instagram_media.id is 'IG media id (string). Stable across syncs; primary key for upsert.';
comment on column public.instagram_media.media_type is 'IG media_type. REELS is technically a sub-type of VIDEO but we surface it separately for the library grid.';
comment on column public.instagram_media.synced_at is 'When we last refreshed this row. A future job can prune rows older than 90 days.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.instagram_connections enable row level security;
alter table public.instagram_connections force  row level security;
alter table public.instagram_media       enable row level security;
alter table public.instagram_media       force  row level security;

create policy instagram_connections_select_own
  on public.instagram_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_connections_insert_self
  on public.instagram_connections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy instagram_connections_update_own
  on public.instagram_connections for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy instagram_connections_delete_own
  on public.instagram_connections for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_media_select_own
  on public.instagram_media for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_media_insert_self
  on public.instagram_media for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy instagram_media_update_own
  on public.instagram_media for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy instagram_media_delete_own
  on public.instagram_media for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.instagram_connections to authenticated;
grant select, insert, update, delete on public.instagram_media to authenticated;
grant all on public.instagram_connections to service_role;
grant all on public.instagram_media       to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe IG state
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

  delete from public.instagram_media        where user_id = target_user_id;
  delete from public.instagram_connections  where user_id = target_user_id;
  delete from public.user_methodology       where user_id = target_user_id;
  delete from public.user_memories          where user_id = target_user_id;
  delete from public.ideas                  where user_id = target_user_id;
  delete from public.messages               where user_id = target_user_id;
  delete from public.conversations          where user_id = target_user_id;
  delete from public.scripts                where user_id = target_user_id;
  delete from public.script_batches         where user_id = target_user_id;
  delete from public.voice_dna              where user_id = target_user_id;
  delete from public.profiles               where id      = target_user_id;
  delete from auth.users                    where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260511000004_admin_invites.sql
-- =============================================================================

-- Bot OS schema delta: admin invites (BO-013)
--
-- Replaces the dashboard-invite stub with a programmatic flow. The
-- admin clicks Invite in /admin/invite, the server action calls
-- supabase.auth.admin.inviteUserByEmail() with the service-role key,
-- and we record one row here per attempt for auditability + rate
-- limiting.
--
-- Admin gating is handled in the application layer via
-- `auth.users.raw_app_meta_data ->> 'is_admin' = 'true'`. RLS on this
-- table is intentionally locked down: NO `authenticated` role grants
-- at all. Every read and write goes through the service-role client
-- in the server action.
--
-- Promote the first admin (one-off, in the Supabase SQL editor):
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                              || '{"is_admin": true}'::jsonb
--    where email = 'you@example.com';

begin;

create table public.admin_invites (
    id           uuid primary key default gen_random_uuid(),
    invited_by   uuid not null references auth.users (id) on delete cascade,
    email        text not null,
    status       text not null default 'sent'
                 check (status in ('sent', 'accepted', 'revoked', 'failed')),
    error        text,
    created_at   timestamptz not null default now(),
    accepted_at  timestamptz,
    constraint admin_invites_email_not_blank
      check (length(btrim(email)) > 0)
);

create index admin_invites_invited_by_created_at_idx
  on public.admin_invites (invited_by, created_at desc);

create index admin_invites_email_idx
  on public.admin_invites (lower(email));

comment on table  public.admin_invites is 'One row per programmatic invite. Service-role-only access; not exposed to the authenticated role.';
comment on column public.admin_invites.invited_by is 'auth.users.id of the admin who issued the invite.';
comment on column public.admin_invites.status is 'sent | accepted | revoked | failed. We only count "sent" for rate-limiting so retry storms do not lock anyone out.';
comment on column public.admin_invites.error is 'Populated when status = failed; surface in the UI for diagnosis.';

alter table public.admin_invites enable row level security;
alter table public.admin_invites force  row level security;

-- No policies for authenticated. The only reader/writer is service_role
-- (which bypasses RLS) via the server action. RLS-enabled-with-no-policy
-- equals deny-by-default for every authenticated request.

grant all on public.admin_invites to service_role;

-- Extend the wipe: drop invites issued by the deleted user. Invites we
-- received (matched by email) are out of scope; the auth.users row is
-- the canonical record there.
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

  delete from public.admin_invites          where invited_by = target_user_id;
  delete from public.instagram_media        where user_id = target_user_id;
  delete from public.instagram_connections  where user_id = target_user_id;
  delete from public.user_methodology       where user_id = target_user_id;
  delete from public.user_memories          where user_id = target_user_id;
  delete from public.ideas                  where user_id = target_user_id;
  delete from public.messages               where user_id = target_user_id;
  delete from public.conversations          where user_id = target_user_id;
  delete from public.scripts                where user_id = target_user_id;
  delete from public.script_batches         where user_id = target_user_id;
  delete from public.voice_dna              where user_id = target_user_id;
  delete from public.profiles               where id      = target_user_id;
  delete from auth.users                    where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260512000000_client_assets.sql
-- =============================================================================

-- Bot OS schema delta: client_assets
--
-- Operator-curated reference material that powers per-client script
-- generation but doesn't fit into voice_dna (a single distilled identity)
-- or user_memories (small atomic facts). Populated by the BO-042 ingestion
-- CLI from local files under clients/<slug>/.
--
-- Asset types kept deliberately coarse so a single jsonb metadata column
-- can carry type-specific structure:
--
--   story            structured story bank entry. metadata holds
--                    { category, funnel_fit, emotions[], universal_truth,
--                      times_used } — preserves the shape from clients/
--                    story_bank.md without spawning four typed columns the
--                    LLM has to fill perfectly.
--   viral_reference  external creator's viral piece + breakdown. metadata
--                    holds { creator, platform, url, why_it_worked }.
--   past_script      a piece the creator wrote and approved. metadata holds
--                    { format, performance } where present.
--   template         a hook / structure template the creator likes.
--                    metadata holds { funnel_fit } where present.
--
-- ScriptGenerator pulls relevant assets per surface (funnel-matched stories,
-- a handful of viral references, etc.) into the system prompt at generation
-- time. Per-user volume is bounded (15-50 rows is normal) so we don't need
-- vector search yet — naive filtered fetch is fine.
--
-- title + body are required so a future search index has fields to grip.
-- source_file is the path the row was ingested from (e.g.
-- 'story_bank.md#getting-kicked-out-at-16') and the upsert key for re-runs.

begin;

create table public.client_assets (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    asset_type  text not null
      check (asset_type in ('story', 'viral_reference', 'past_script', 'template')),
    title       text not null,
    body        text not null,
    metadata    jsonb not null default '{}'::jsonb,
    source_file text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint client_assets_title_not_blank check (length(btrim(title))  > 0),
    constraint client_assets_body_not_blank  check (length(btrim(body))   > 0)
);

-- Idempotent re-ingestion: (user_id, source_file) keys the upsert when
-- the operator re-runs `ingest:commit` after editing .extracted.json.
-- source_file is nullable for assets that don't come from a single file
-- (e.g. consolidated entries pasted via the future admin UI); those use
-- the unconditional insert path instead of upsert.
create unique index client_assets_user_source_file_unique
  on public.client_assets (user_id, source_file)
  where source_file is not null;

create index client_assets_user_type_idx
  on public.client_assets (user_id, asset_type, created_at desc);

comment on table  public.client_assets is 'Operator-curated reference material per user (stories, viral references, past scripts, templates). Loaded into script-generation prompts at runtime.';
comment on column public.client_assets.metadata is 'Type-specific structured fields. Shape varies by asset_type — see migration header.';
comment on column public.client_assets.source_file is 'Path under clients/<slug>/ this row was extracted from. Upsert key for idempotent re-ingest.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create trigger client_assets_set_updated_at
  before update on public.client_assets
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client_assets enable row level security;
alter table public.client_assets force  row level security;

-- Users see their own assets. Writes happen via service_role from the
-- ingestion CLI; an authenticated user has no path to mutate these from
-- the client. If a future feature adds in-app editing it gets explicit
-- insert/update/delete policies then.
create policy client_assets_select_own
  on public.client_assets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF — see init migration)
-- ---------------------------------------------------------------------------
grant select on public.client_assets to authenticated;
grant all on public.client_assets to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe client_assets.
--
-- Insertion order in the function preserves FK safety: child rows go
-- before parent rows. client_assets has no children, so it goes near the
-- top alongside the other leaf tables.
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

  delete from public.client_assets         where user_id = target_user_id;
  delete from public.admin_invites         where invited_by = target_user_id;
  delete from public.instagram_media       where user_id = target_user_id;
  delete from public.instagram_connections where user_id = target_user_id;
  delete from public.user_methodology      where user_id = target_user_id;
  delete from public.user_memories         where user_id = target_user_id;
  delete from public.ideas                 where user_id = target_user_id;
  delete from public.messages              where user_id = target_user_id;
  delete from public.conversations         where user_id = target_user_id;
  delete from public.scripts               where user_id = target_user_id;
  delete from public.script_batches        where user_id = target_user_id;
  delete from public.voice_dna             where user_id = target_user_id;
  delete from public.profiles              where id      = target_user_id;
  delete from auth.users                   where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260512000001_client_assets_index_fix.sql
-- =============================================================================

-- Bot OS migration: client_assets unique index correction
--
-- The original migration 20260512000000 declared a partial unique index:
--
--   create unique index client_assets_user_source_file_unique
--     on public.client_assets (user_id, source_file)
--     where source_file is not null;
--
-- Postgres does not allow partial indexes as ON CONFLICT targets, so the
-- `.upsert(rows, { onConflict: "user_id,source_file" })` call from the
-- ingestion CLI fails with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Drop the partial form and recreate as a regular unique index. NULL
-- handling stays correct under Postgres's default NULLS DISTINCT
-- semantics: a row whose source_file is NULL never collides with
-- another NULL-source row, so assets without a path keep behaving as
-- "always insert". Rows with a path still get the (user_id,source_file)
-- uniqueness needed for idempotent re-ingest.

begin;

drop index if exists public.client_assets_user_source_file_unique;

create unique index client_assets_user_source_file_unique
  on public.client_assets (user_id, source_file);

commit;

-- =============================================================================
-- 20260512000002_conversations_delete.sql
-- =============================================================================

-- Bot OS schema delta: allow users to delete their own conversations.
--
-- The original chat migration (20260510000001) intentionally left DELETE
-- off conversations + messages because the spec at the time was
-- "append-only history". Operator feedback after first live use was that
-- the user needs a way to clear conversations they don't want anymore
-- (especially the experimental ones from before the assistant was tuned).
--
-- Scope: conversations only. messages remain insert-only at the policy
-- layer; they get wiped via the existing ON DELETE CASCADE foreign key
-- on messages.conversation_id when the parent conversation is deleted.
-- That keeps the "message rows can never be edited in place" invariant
-- intact while letting the user purge a whole thread.

begin;

create policy conversations_delete_own
  on public.conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.conversations to authenticated;

commit;

-- =============================================================================
-- 20260513000000_instagram_media_analysis.sql
-- =============================================================================

-- Bot OS schema delta: instagram_media_analysis + research_analysis_runs
--
-- Per-video analysis output for the user's own Instagram library
-- (BO-043). One analysis row per media row; the FK uses the IG media id
-- as the primary key so re-analysis is an upsert and there's no
-- ambiguity about which media a row belongs to.
--
-- All writes happen from the Inngest `analyze-media` function under the
-- service-role client (the function has no end-user JWT in scope). The
-- RLS policies grant SELECT-own only so the UI can fetch and render.
--
-- research_analysis_runs is the audit log used by the per-user rolling
-- 30-day rate limit. Each successful analysis writes one row; the
-- limiter counts rows since (now() - 30 days). Same pattern as
-- admin_invites from BO-013.

begin;

-- ---------------------------------------------------------------------------
-- instagram_media_analysis
-- ---------------------------------------------------------------------------
create table public.instagram_media_analysis (
    media_id          text primary key
                         references public.instagram_media (id) on delete cascade,
    user_id           uuid not null references auth.users (id) on delete cascade,
    transcript        text not null,
    hook              text,
    structure         text,
    pillar_match      text,
    performance_label text,
    what_worked       text,
    what_to_repeat    text,
    llm_model         text not null,
    transcript_model  text not null,
    analyzed_at       timestamptz not null default now(),
    constraint instagram_media_analysis_transcript_not_blank
      check (length(btrim(transcript)) > 0)
);

create index instagram_media_analysis_user_analyzed_at_idx
  on public.instagram_media_analysis (user_id, analyzed_at desc);

comment on table  public.instagram_media_analysis is 'One row per analyzed video. Written by the analyze-media Inngest function under service-role.';
comment on column public.instagram_media_analysis.performance_label is 'Library-relative bucket. One of: top, above_median, median, below_median, bottom. Computed at analysis time off the user''s own reach percentiles.';
comment on column public.instagram_media_analysis.transcript_model is 'Transcription provider id, e.g. deepgram-nova-3. Pinned so re-analysis is reproducible.';

-- ---------------------------------------------------------------------------
-- research_analysis_runs (rolling-window rate limit log)
-- ---------------------------------------------------------------------------
create table public.research_analysis_runs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    media_id    text not null,
    created_at  timestamptz not null default now()
);

create index research_analysis_runs_user_created_at_idx
  on public.research_analysis_runs (user_id, created_at desc);

comment on table  public.research_analysis_runs is 'Audit log for the rolling-30d analysis rate limit. One row per successful analysis; the limiter counts rows newer than (now() - 30d).';

-- ---------------------------------------------------------------------------
-- RLS + grants
--
-- instagram_media_analysis: SELECT own; service-role does all writes via
-- the Inngest function. Re-analysis is an UPDATE-after-DELETE pattern
-- the function handles; users can't mutate.
--
-- research_analysis_runs: writes are service-role only; no read for
-- authenticated either (it's an audit log; the user doesn't need to see
-- their own quota usage in v1).
-- ---------------------------------------------------------------------------
alter table public.instagram_media_analysis enable row level security;
alter table public.instagram_media_analysis force  row level security;
alter table public.research_analysis_runs   enable row level security;
alter table public.research_analysis_runs   force  row level security;

create policy instagram_media_analysis_select_own
  on public.instagram_media_analysis for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- research_analysis_runs has NO authenticated policies; access via
-- service_role only. The grants below match.

grant select on public.instagram_media_analysis to authenticated;
grant all    on public.instagram_media_analysis to service_role;
grant all    on public.research_analysis_runs   to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe research state
--
-- Insertion order keeps FK safety: media_analysis cascades via
-- instagram_media (already wiped further down), but we drop it
-- explicitly here so the wipe order is human-readable and survives any
-- future FK changes. research_analysis_runs has no children.
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

  delete from public.research_analysis_runs    where user_id = target_user_id;
  delete from public.instagram_media_analysis  where user_id = target_user_id;
  delete from public.client_assets             where user_id = target_user_id;
  delete from public.admin_invites             where invited_by = target_user_id;
  delete from public.instagram_media           where user_id = target_user_id;
  delete from public.instagram_connections     where user_id = target_user_id;
  delete from public.user_methodology          where user_id = target_user_id;
  delete from public.user_memories             where user_id = target_user_id;
  delete from public.ideas                     where user_id = target_user_id;
  delete from public.messages                  where user_id = target_user_id;
  delete from public.conversations             where user_id = target_user_id;
  delete from public.scripts                   where user_id = target_user_id;
  delete from public.script_batches            where user_id = target_user_id;
  delete from public.voice_dna                 where user_id = target_user_id;
  delete from public.profiles                  where id      = target_user_id;
  delete from auth.users                       where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260513000001_realtime_media_analysis.sql
-- =============================================================================

-- Bot OS schema delta: enable realtime on instagram_media_analysis
--
-- The /library page subscribes to inserts on this table so the UI can
-- auto-refresh the moment an analysis row lands, rather than leaving
-- the user stuck on the "Analyzing..." spinner until they hit reload.
--
-- Supabase exposes per-table realtime via the `supabase_realtime`
-- publication. New tables are NOT auto-added (matches our convention
-- for "Automatically expose new tables = OFF"). RLS on the table still
-- applies to realtime events: the browser only receives change events
-- for rows it would otherwise be able to SELECT, so cross-user leaks
-- are blocked.

begin;

alter publication supabase_realtime add table public.instagram_media_analysis;

commit;

-- =============================================================================
-- 20260514000000_api_usage.sql
-- =============================================================================

-- Bot OS schema delta: api_usage (BO-047)
--
-- Append-only audit of every Anthropic SDK round trip. One row per
-- response. Records who initiated it (user_id, nullable for system /
-- ingestion calls that have no creator context), which surface fired
-- it (chat | voice_dna | memory_extract | script | imf | hooks |
-- single_script | media_analysis | other), the model, and the four
-- token counts the SDK returns.
--
-- Cost is NOT stored. Pricing changes, models get re-priced, and we
-- want every page that surfaces $ to reflect the current rate sheet.
-- Compute it in TS at read time from the token columns + a small
-- model -> price map.
--
-- Service-role only. RLS is enabled with zero `authenticated` policies
-- so the table is invisible to any signed-in user; only the server
-- action / Inngest worker writes via the service-role client, and the
-- /admin page reads the same way.

begin;

create table public.api_usage (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid references auth.users (id) on delete set null,
    surface                  text not null
                             check (surface in (
                               'chat', 'voice_dna', 'memory_extract',
                               'script', 'imf', 'hooks', 'single_script',
                               'media_analysis', 'other'
                             )),
    model                    text not null,
    input_tokens             int  not null default 0 check (input_tokens >= 0),
    output_tokens            int  not null default 0 check (output_tokens >= 0),
    cache_creation_tokens    int  not null default 0 check (cache_creation_tokens >= 0),
    cache_read_tokens        int  not null default 0 check (cache_read_tokens >= 0),
    stop_reason              text,
    created_at               timestamptz not null default now()
);

create index api_usage_user_id_created_at_idx
  on public.api_usage (user_id, created_at desc);
create index api_usage_created_at_idx
  on public.api_usage (created_at desc);
create index api_usage_surface_idx
  on public.api_usage (surface);

comment on table  public.api_usage is 'Append-only token-usage audit. Service-role-only. Drives /admin spend metrics.';
comment on column public.api_usage.user_id is 'Creator the call was made on behalf of. NULL = system call (e.g. ingestion CLI).';
comment on column public.api_usage.surface is 'Which engine/feature fired the call. Constrained so /admin can group cleanly.';

alter table public.api_usage enable row level security;
alter table public.api_usage force  row level security;

-- No authenticated policies: deny-by-default for every signed-in user.
-- Service-role bypasses RLS.

grant all on public.api_usage to service_role;

-- Extend the wipe: user_id is ON DELETE SET NULL so the row sticks
-- around as anonymous spend history (useful for retroactive cost
-- forensics). delete_user_data() is the GDPR path though, so we do
-- nuke their rows explicitly there.
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

  delete from public.api_usage                 where user_id = target_user_id;
  delete from public.research_analysis_runs    where user_id = target_user_id;
  delete from public.instagram_media_analysis  where user_id = target_user_id;
  delete from public.client_assets             where user_id = target_user_id;
  delete from public.admin_invites             where invited_by = target_user_id;
  delete from public.instagram_media           where user_id = target_user_id;
  delete from public.instagram_connections     where user_id = target_user_id;
  delete from public.user_methodology          where user_id = target_user_id;
  delete from public.user_memories             where user_id = target_user_id;
  delete from public.ideas                     where user_id = target_user_id;
  delete from public.messages                  where user_id = target_user_id;
  delete from public.conversations             where user_id = target_user_id;
  delete from public.scripts                   where user_id = target_user_id;
  delete from public.script_batches            where user_id = target_user_id;
  delete from public.voice_dna                 where user_id = target_user_id;
  delete from public.profiles                  where id      = target_user_id;
  delete from auth.users                       where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260514100000_master_bot.sql
-- =============================================================================

-- Bot OS schema delta: Master Bot (BO-048)
--
-- Two-layer methodology editor for admins.
--
-- Layer 1: methodology_rules
--   Short one-liners ("never recommend pricing tactics"). Visible in the
--   admin UI as a list per slice. Soft-deleted so the Master Bot can
--   recall a previously-removed rule when the admin re-raises the topic.
--
-- Layer 2: house_methodology + house_methodology_versions
--   The big rule sheets, one row per slice. The .md files under
--   docs/methodology/ are the seed; once a row lands here the loader
--   prefers DB. Admins never see the raw text. Every save snapshots the
--   PRIOR content into _versions for revert + audit.
--
-- master_bot_messages: chat log for /admin/master-bot. Shared across
-- admins (no user_id scoping). One thread; no Voice DNA, no anti-slop.
--
-- All tables are service-role only at the RLS layer. The server action
-- gates by isAdmin() on the JWT.

begin;

-- ---------------------------------------------------------------------------
-- methodology_rules
-- ---------------------------------------------------------------------------
create table public.methodology_rules (
    id          uuid primary key default gen_random_uuid(),
    slice       text not null
                check (slice in ('house', 'chat', 'scripts', 'analyst')),
    rule        text not null check (length(btrim(rule)) > 0 and length(rule) <= 400),
    created_by  uuid references auth.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz
);

create index methodology_rules_slice_active_idx
  on public.methodology_rules (slice)
  where deleted_at is null;

comment on table  public.methodology_rules is 'Admin-authored one-liners. Append to each slice prompt at render time. Soft-deleted.';
comment on column public.methodology_rules.slice is 'house | chat | scripts | analyst. house applies to every engine.';

alter table public.methodology_rules enable row level security;
alter table public.methodology_rules force  row level security;
grant all on public.methodology_rules to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology
-- ---------------------------------------------------------------------------
create table public.house_methodology (
    slice       text primary key
                check (slice in ('house', 'chat', 'scripts', 'analyst')),
    content     text not null,
    updated_by  uuid references auth.users (id) on delete set null,
    updated_at  timestamptz not null default now()
);

comment on table public.house_methodology is 'DB-backed methodology slices. Admin-invisible; only the Master Bot reads / writes the raw text.';

alter table public.house_methodology enable row level security;
alter table public.house_methodology force  row level security;
grant all on public.house_methodology to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology_versions (append-only history)
-- ---------------------------------------------------------------------------
create table public.house_methodology_versions (
    id              uuid primary key default gen_random_uuid(),
    slice           text not null
                    check (slice in ('house', 'chat', 'scripts', 'analyst')),
    content         text not null,
    summary         text not null check (length(btrim(summary)) > 0),
    created_by      uuid references auth.users (id) on delete set null,
    created_at      timestamptz not null default now()
);

create index house_methodology_versions_slice_created_at_idx
  on public.house_methodology_versions (slice, created_at desc);

comment on table  public.house_methodology_versions is 'Append-only history. One row per house_methodology save; content here is the version BEFORE the change so revert is "copy this row back".';
comment on column public.house_methodology_versions.summary is 'Plain-English summary the Master Bot wrote when it proposed the edit. Shown on the history page.';

alter table public.house_methodology_versions enable row level security;
alter table public.house_methodology_versions force  row level security;
grant all on public.house_methodology_versions to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology_proposals (pending edits awaiting admin Apply / Discard)
-- ---------------------------------------------------------------------------
create table public.house_methodology_proposals (
    id              uuid primary key default gen_random_uuid(),
    slice           text not null
                    check (slice in ('house', 'chat', 'scripts', 'analyst')),
    new_content     text not null,
    summary         text not null check (length(btrim(summary)) > 0),
    status          text not null default 'pending'
                    check (status in ('pending', 'applied', 'discarded')),
    proposed_by     uuid references auth.users (id) on delete set null,
    decided_by      uuid references auth.users (id) on delete set null,
    decided_at      timestamptz,
    created_at      timestamptz not null default now()
);

create index house_methodology_proposals_status_created_at_idx
  on public.house_methodology_proposals (status, created_at desc);

comment on table public.house_methodology_proposals is 'Staged house edits the Master Bot has proposed. The admin clicks Apply (-> house_methodology + _versions) or Discard.';

alter table public.house_methodology_proposals enable row level security;
alter table public.house_methodology_proposals force  row level security;
grant all on public.house_methodology_proposals to service_role;

-- ---------------------------------------------------------------------------
-- master_bot_messages (shared thread, not per-user)
-- ---------------------------------------------------------------------------
create table public.master_bot_messages (
    id           uuid primary key default gen_random_uuid(),
    author_id    uuid references auth.users (id) on delete set null,
    role         text not null check (role in ('user', 'assistant', 'system')),
    content      text not null,
    created_at   timestamptz not null default now()
);

create index master_bot_messages_created_at_idx
  on public.master_bot_messages (created_at asc);

comment on table public.master_bot_messages is 'Shared admin-only chat log for the Master Bot. Not scoped per user; every admin sees the same thread.';

alter table public.master_bot_messages enable row level security;
alter table public.master_bot_messages force  row level security;
grant all on public.master_bot_messages to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: deleting an admin's auth row should NOT wipe the
-- methodology they wrote (operator-owned, shared resource). The FKs are
-- ON DELETE SET NULL so rows survive with a null `created_by` /
-- `updated_by` / `author_id`. Nothing to add to the wipe function.
-- ---------------------------------------------------------------------------

commit;

-- =============================================================================
-- 20260515000000_client_corpus.sql
-- =============================================================================

-- Bot OS schema delta: client_corpus (BO-049)
--
-- Two-tier client information model. Tier 1 — voice_dna / user_methodology /
-- user_memories / client_assets — stays small and is loaded verbatim into the
-- system prompt on every chat + script turn. Tier 2 is THIS migration: the
-- full raw corpus (Fathom transcripts, weekly questionnaires, long-form
-- notes) lives here, gets chunked + embedded, and is retrieved on demand.
--
-- Chat surface (explicit): the chat-engine registers a `search_client_corpus`
-- tool; the LLM calls it when the user references a specific past artifact.
-- Script surface (implicit): script-generator embeds the seed prompt at
-- gen start and pulls top-k chunks into the system prompt.
--
-- Per-user volumes are now expected to grow weekly (new questionnaire +
-- 1-3 Fathom calls), so vector search is warranted — keyword/recency
-- retrieval over a long-tail transcript corpus misses too much.
--
--   client_documents          one row per ingested raw artifact. Holds the
--                             full text + source classification. Append-only;
--                             re-ingest replaces by (user_id, source_path).
--
--   client_document_chunks    embedded chunks (~800 tokens). HNSW index on
--                             embedding for cosine similarity retrieval.
--                             Cascaded delete from parent document.
--
-- Source types deliberately distinct from client_assets.asset_type. client_
-- assets is curated reference (operator-edited, capped, prompt-injected).
-- client_documents is the firehose (raw, large, retrieved-only).

begin;

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- client_documents
-- ---------------------------------------------------------------------------
create table public.client_documents (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    source_type   text not null
      check (source_type in (
        'fathom_transcript',
        'questionnaire',
        'note',
        'long_form'
      )),
    title         text not null,
    body          text not null,
    captured_at   timestamptz not null default now(),
    source_path   text,
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint client_documents_title_not_blank check (length(btrim(title)) > 0),
    constraint client_documents_body_not_blank  check (length(btrim(body))  > 0)
);

create unique index client_documents_user_source_path_unique
  on public.client_documents (user_id, source_path)
  where source_path is not null;

create index client_documents_user_captured_idx
  on public.client_documents (user_id, captured_at desc);

create index client_documents_user_type_idx
  on public.client_documents (user_id, source_type, captured_at desc);

comment on table  public.client_documents is 'Raw long-form client artifacts (Fathom transcripts, weekly questionnaires, notes). Retrieved by similarity, never injected wholesale.';
comment on column public.client_documents.source_path is 'Path under clients/<slug>/ this row was ingested from. Upsert key for incremental re-ingest.';
comment on column public.client_documents.captured_at is 'When the artifact itself was created (Fathom call date, questionnaire submit), not when it was ingested.';

-- ---------------------------------------------------------------------------
-- client_document_chunks
-- ---------------------------------------------------------------------------
-- Dimension 1024 matches Voyage voyage-3 (Anthropic's recommended embeddings
-- provider). Pinned in code via EMBEDDING_DIMENSIONS so a future model
-- change requires an explicit migration rather than silently writing
-- wrong-dimension vectors.
create table public.client_document_chunks (
    id             uuid primary key default gen_random_uuid(),
    document_id    uuid not null references public.client_documents (id) on delete cascade,
    user_id        uuid not null references auth.users (id) on delete cascade,
    chunk_index    integer not null,
    chunk_text     text not null,
    embedding      vector(1024) not null,
    metadata       jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    constraint client_document_chunks_text_not_blank check (length(btrim(chunk_text)) > 0),
    constraint client_document_chunks_index_nonneg   check (chunk_index >= 0)
);

create unique index client_document_chunks_doc_idx_unique
  on public.client_document_chunks (document_id, chunk_index);

create index client_document_chunks_user_doc_idx
  on public.client_document_chunks (user_id, document_id);

-- HNSW gives better recall than IVFFlat at our row counts and doesn't need
-- a population step before it becomes useful. Cosine distance matches the
-- normalization OpenAI returns. m / ef_construction defaults are tuned for
-- accuracy over insert speed; ingestion is offline anyway.
create index client_document_chunks_embedding_hnsw_idx
  on public.client_document_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

comment on table  public.client_document_chunks is 'Chunked + embedded slices of client_documents. Queried via match_client_chunks RPC.';
comment on column public.client_document_chunks.user_id is 'Denormalized from parent document so the HNSW index can be combined with a user_id filter cheaply.';

-- ---------------------------------------------------------------------------
-- updated_at trigger on client_documents
-- ---------------------------------------------------------------------------
create trigger client_documents_set_updated_at
  before update on public.client_documents
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client_documents       enable row level security;
alter table public.client_documents       force  row level security;
alter table public.client_document_chunks enable row level security;
alter table public.client_document_chunks force  row level security;

create policy client_documents_select_own
  on public.client_documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy client_document_chunks_select_own
  on public.client_document_chunks for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.client_documents       to authenticated;
grant select on public.client_document_chunks to authenticated;
grant all    on public.client_documents       to service_role;
grant all    on public.client_document_chunks to service_role;

-- ---------------------------------------------------------------------------
-- match_client_chunks RPC
--
-- Returns top-k chunks for a given user_id ordered by cosine similarity.
-- Joins document metadata (title, source_type, captured_at) so the caller
-- gets enough context to format a useful tool_result block without a
-- follow-up query.
--
-- security invoker — RLS on the underlying tables still applies, so a
-- mis-scoped caller can't read another user's chunks even if they pass
-- the wrong user_id. The user_id arg is the FILTER, RLS is the FENCE.
-- ---------------------------------------------------------------------------
create or replace function public.match_client_chunks(
  query_embedding vector(1024),
  match_user_id   uuid,
  match_count     integer default 6
)
returns table (
  chunk_id       uuid,
  document_id    uuid,
  chunk_index    integer,
  chunk_text     text,
  source_type    text,
  document_title text,
  captured_at    timestamptz,
  similarity     real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id                              as chunk_id,
    c.document_id                     as document_id,
    c.chunk_index                     as chunk_index,
    c.chunk_text                      as chunk_text,
    d.source_type                     as source_type,
    d.title                           as document_title,
    d.captured_at                     as captured_at,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.client_document_chunks c
  join public.client_documents       d on d.id = c.document_id
  where c.user_id = match_user_id
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 50));
$$;

grant execute on function public.match_client_chunks(vector(1024), uuid, integer) to authenticated;
grant execute on function public.match_client_chunks(vector(1024), uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe the corpus.
--
-- Chunks are deleted first via FK cascade when the parent document is
-- removed, but the explicit DELETE on chunks is kept for clarity (and so a
-- future per-chunk maintenance task can't leave orphans).
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

  delete from public.client_document_chunks    where user_id = target_user_id;
  delete from public.client_documents          where user_id = target_user_id;
  delete from public.api_usage                 where user_id = target_user_id;
  delete from public.research_analysis_runs    where user_id = target_user_id;
  delete from public.instagram_media_analysis  where user_id = target_user_id;
  delete from public.client_assets             where user_id = target_user_id;
  delete from public.admin_invites             where invited_by = target_user_id;
  delete from public.instagram_media           where user_id = target_user_id;
  delete from public.instagram_connections     where user_id = target_user_id;
  delete from public.user_methodology          where user_id = target_user_id;
  delete from public.user_memories             where user_id = target_user_id;
  delete from public.ideas                     where user_id = target_user_id;
  delete from public.messages                  where user_id = target_user_id;
  delete from public.conversations             where user_id = target_user_id;
  delete from public.scripts                   where user_id = target_user_id;
  delete from public.script_batches            where user_id = target_user_id;
  delete from public.voice_dna                 where user_id = target_user_id;
  delete from public.profiles                  where id      = target_user_id;
  delete from auth.users                       where id      = target_user_id;
end;
$$;

commit;

-- =============================================================================
-- 20260515000001_client_documents_unique_fix.sql
-- =============================================================================

-- Bot OS schema delta: client_documents unique index fix (BO-052 follow-up)
--
-- The original index in migration 20260515000000_client_corpus.sql was:
--
--   create unique index client_documents_user_source_path_unique
--     on public.client_documents (user_id, source_path)
--     where source_path is not null;
--
-- Partial indexes only match an INSERT's ON CONFLICT clause when the WHERE
-- predicate is repeated literally inside that clause. supabase-js's
-- `.upsert({ onConflict: "user_id,source_path" })` does not expose the
-- predicate, so every corpus ingestion run failed with:
--
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- Replacing the partial index with a full unique index makes the upsert
-- path match. The original intent (rows with a null source_path are
-- allowed to coexist) is preserved by Postgres's default NULLS DISTINCT
-- semantics on unique indexes — multiple `(user_id, NULL)` rows for the
-- same user are still permitted.

begin;

drop index if exists public.client_documents_user_source_path_unique;

create unique index client_documents_user_source_path_unique
  on public.client_documents (user_id, source_path);

commit;

-- =============================================================================
-- 20260516000000_scripts_angle_pillar.sql
-- =============================================================================

-- Bot OS schema delta: scripts.angle + scripts.pillar (BO-056)
--
-- Adds the two columns the dashboard's Trust Funnel Balance chart and
-- pillar-distribution chart need to compute live metrics. Until now the
-- columns lived only on the in-memory `GeneratedScript` shape and were
-- discarded at insert time, so the dashboard hardcoded `angle: null` and
-- every user's funnel chart was empty.
--
-- Both columns are nullable so existing rows keep working — the
-- dashboard's tally already filters out nulls.
--
-- The angle check constraint mirrors the `ScriptAngle` union in
-- src/engines/content/types.ts so an inadvertently misspelled angle from
-- the model fails fast at write time rather than silently miscounting.

begin;

alter table public.scripts
  add column if not exists angle text,
  add column if not exists pillar text;

alter table public.scripts
  drop constraint if exists scripts_angle_check;

alter table public.scripts
  add constraint scripts_angle_check
  check (
    angle is null
    or angle in (
      'pain_point',
      'aspiration',
      'contrarian',
      'case_study',
      'framework',
      'story',
      'myth_buster'
    )
  );

-- The dashboard reads the most recent 12 rows per user and tallies by
-- angle. A partial index on the funnel columns scoped to non-null angle
-- keeps that lookup cheap as the library grows past the smoke-test
-- corpora.
create index if not exists scripts_user_created_funnel_idx
  on public.scripts (user_id, created_at desc)
  where angle is not null;

commit;
