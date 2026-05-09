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
