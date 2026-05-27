-- Bot OS schema delta: enable realtime on competitor_accounts (BO-062)
--
-- /research subscribes to update events on this table so the sync
-- state badge (Syncing... / Last sync <date> / Sync failed) flips the
-- moment the Inngest worker writes back, instead of waiting on a
-- manual page reload.
--
-- Same shape as 20260513000001_realtime_media_analysis.sql: add the
-- table to the supabase_realtime publication; RLS continues to apply
-- so the browser only receives change events it could SELECT anyway.

begin;

alter publication supabase_realtime add table public.competitor_accounts;

commit;
