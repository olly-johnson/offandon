-- Bot OS schema delta: REPLICA IDENTITY FULL on competitor_accounts (BO-062)
--
-- /research's realtime subscription listens to UPDATE events on this
-- table (last_synced_at, last_sync_error, sync_pending) with a filter
-- on user_id. By default Postgres logs only the primary key on UPDATE
-- (REPLICA IDENTITY DEFAULT), so the realtime broadcast event carries
-- only `id` — Supabase has no `user_id` to match the filter against,
-- and the event is silently dropped before reaching the browser.
--
-- REPLICA IDENTITY FULL tells Postgres to log the whole old + new row
-- on UPDATE, which costs a bit more WAL but unblocks filtered realtime
-- subscriptions on non-PK columns. instagram_media_analysis didn't
-- need this because /library listens to INSERTs, which already include
-- every column.

begin;

alter table public.competitor_accounts replica identity full;

commit;
