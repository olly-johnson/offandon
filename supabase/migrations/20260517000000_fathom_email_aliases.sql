-- Bot OS schema delta: fathom_email_aliases (BO-061)
--
-- Manual mapping from Fathom invitee emails to site user_ids. Needed because:
--   1. A single Fathom recording can have multiple attendees who each have
--      a site account (the operator + one or more clients) — all of them
--      should see the call on their /transcripts page.
--   2. A user's Fathom email may differ from their auth.users.email
--      (gmail on one side, work address on the other). The webhook + the
--      backfill script intersect each attendee email against auth.users
--      AND this alias table to find every site user the recording belongs
--      to.
--
-- Operator workflow:
--   - Run `npm run backfill:fathom -- --unmatched` to see which Fathom
--     emails appeared in recordings but don't yet map to any site user.
--   - Use `npm run fathom:aliases -- --add <user_id> <fathom_email>` to
--     wire those through.
--   - Re-run `npm run backfill:fathom` so the newly mapped users pick up
--     their historical recordings (idempotent via source_path).
--
-- The primary key intentionally puts user_id first because the most
-- common lookups are "all emails for this user" (for the aliases admin
-- view) and "any user_id for this email" (for the ingestion lookup). The
-- secondary index on (fathom_email) makes the latter cheap.

begin;

create table public.fathom_email_aliases (
    user_id       uuid not null references auth.users (id) on delete cascade,
    fathom_email  text not null,
    created_at    timestamptz not null default now(),
    primary key (user_id, fathom_email),
    constraint fathom_email_aliases_email_lowercase
      check (fathom_email = lower(fathom_email)),
    constraint fathom_email_aliases_email_shape
      check (fathom_email like '%@%')
);

create index fathom_email_aliases_email_idx
  on public.fathom_email_aliases (fathom_email);

comment on table  public.fathom_email_aliases is 'Manual mapping of Fathom invitee emails to site user_ids when they differ from auth.users.email. Resolved by the Fathom ingest path (webhook + backfill).';
comment on column public.fathom_email_aliases.fathom_email is 'Lowercased Fathom email. The lowercase check + trigger keep it normalised at write time.';

-- Normalise on insert/update so callers don't have to.
create or replace function public.tg_lowercase_fathom_email()
returns trigger
language plpgsql
as $$
begin
  new.fathom_email = lower(btrim(new.fathom_email));
  return new;
end;
$$;

create trigger fathom_email_aliases_lowercase
  before insert or update on public.fathom_email_aliases
  for each row execute function public.tg_lowercase_fathom_email();

-- ---------------------------------------------------------------------------
-- RLS — users may read their own aliases; writes are service-role only
-- (alias creation runs from the CLI / future admin UI via the admin client).
-- ---------------------------------------------------------------------------
alter table public.fathom_email_aliases enable row level security;
alter table public.fathom_email_aliases force  row level security;

create policy fathom_email_aliases_select_own
  on public.fathom_email_aliases for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select                         on public.fathom_email_aliases to authenticated;
grant select, insert, update, delete on public.fathom_email_aliases to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: extend with fathom_email_aliases. Cascade from auth.users
-- handles it too, but explicit deletion keeps the ordering documented and
-- isolates timing of the row removal from auth.users teardown.
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

  delete from public.fathom_email_aliases      where user_id = target_user_id;
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
