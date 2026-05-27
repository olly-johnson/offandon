-- Bot OS schema delta: competitor_accounts (BO-061)
--
-- One row per (user, tracked Instagram handle). Used by /research to
-- let a creator pin up to 5 competitor accounts whose videos will be
-- downloaded, transcribed, and analysed to feed back into the user's
-- methodology (hook bank, format patterns, topic coverage).
--
-- This migration is just the tracking primitive. The follow-up
-- migrations add competitor_media + competitor_media_analysis once
-- the scraping integration is wired (BO-062).
--
-- The 5-account cap is enforced in the engine (addCompetitor), not in
-- the DB; a trigger would be heavier than the constraint deserves.
-- RLS still prevents anyone writing rows for someone else's user_id,
-- so the cap is a UX rail, not a security boundary.

begin;

create table public.competitor_accounts (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    username        text not null,
    display_name    text,
    note            text,
    added_at        timestamptz not null default now(),
    last_synced_at  timestamptz,
    last_sync_error text,
    constraint competitor_accounts_username_format
      check (username ~ '^[A-Za-z0-9._]{1,30}$')
);

create unique index competitor_accounts_user_username_unique
  on public.competitor_accounts (user_id, lower(username));

create index competitor_accounts_user_added_at_idx
  on public.competitor_accounts (user_id, added_at asc);

comment on table  public.competitor_accounts is 'IG handles a creator wants Research to track. Capped at 5/user in the engine layer.';
comment on column public.competitor_accounts.username       is 'IG handle without the leading @, lowercased. Validated by check + engine.';
comment on column public.competitor_accounts.display_name   is 'Optional human label populated by the scraper once it resolves the profile.';
comment on column public.competitor_accounts.last_synced_at is 'Last time the scraper completed a pass for this competitor. Null until first run.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.competitor_accounts enable row level security;
alter table public.competitor_accounts force  row level security;

create policy competitor_accounts_select_own
  on public.competitor_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy competitor_accounts_insert_self
  on public.competitor_accounts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy competitor_accounts_update_own
  on public.competitor_accounts for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy competitor_accounts_delete_own
  on public.competitor_accounts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.competitor_accounts to authenticated;
grant all                            on public.competitor_accounts to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: extend with competitor_accounts. Inserted at the front
-- so the existing child-before-parent ordering is preserved.
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

  delete from public.competitor_accounts       where user_id = target_user_id;
  delete from public.weekly_checkins           where user_id = target_user_id;
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
