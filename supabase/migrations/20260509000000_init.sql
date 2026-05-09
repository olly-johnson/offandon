-- Bot OS — initial schema
-- Adds: profiles, scripts, RLS policies, GDPR hard-delete function.
--
-- Conventions:
--   * Every user-owned table has user_id (or id, for profiles) referencing
--     auth.users(id) ON DELETE CASCADE. The cascade is a defense-in-depth
--     fallback; the canonical wipe path is delete_user_data().
--   * RLS is ENABLED and FORCED on every user-owned table — table owners
--     are also subject to policies, preventing accidental bypass.
--   * Policies require both authenticated role AND user_id = auth.uid().

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
alter table public.profiles enable row level security;
alter table public.profiles force  row level security;
alter table public.scripts  enable row level security;
alter table public.scripts  force  row level security;

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

-- Anon role gets nothing.
revoke all on public.profiles from anon;
revoke all on public.scripts  from anon;

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

  delete from public.scripts  where user_id = target_user_id;
  delete from public.profiles where id      = target_user_id;
  delete from auth.users      where id      = target_user_id;
end;
$$;

revoke all     on function public.delete_user_data(uuid) from public, anon;
grant  execute on function public.delete_user_data(uuid) to authenticated, service_role;

comment on function public.delete_user_data(uuid) is
  'GDPR hard-delete. Caller must be the target user or service_role. Extend with new tables as they are added.';

commit;
