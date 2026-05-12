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
