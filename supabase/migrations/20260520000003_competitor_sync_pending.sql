-- Bot OS schema delta: competitor_accounts.sync_pending (BO-062 fix)
--
-- Distinguish "this row has never been synced" from "a sync is in
-- flight right now". Both states had last_synced_at = null and
-- last_sync_error = null, which left the UI rendering "Syncing..." for
-- a freshly added competitor and disabling the very button that would
-- have started the scrape. sync_pending is the authoritative in-flight
-- signal: the server action flips it true when emitting the Inngest
-- event, the worker flips it back to false on success or failure.

begin;

alter table public.competitor_accounts
  add column if not exists sync_pending boolean not null default false;

comment on column public.competitor_accounts.sync_pending is
  'True while a scrape Inngest run is in flight. Worker resets to false on success/failure.';

commit;
