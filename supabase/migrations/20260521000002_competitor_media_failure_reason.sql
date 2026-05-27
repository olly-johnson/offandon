-- Bot OS schema delta: competitor_media.analysis_failed_reason (BO-063 fix)
--
-- The /research drill-in tile spins on "Analyzing..." until a row
-- lands in competitor_media_analysis. If the analyzer worker throws
-- (Deepgram failure, rate-limit hit, missing voice_dna), no row ever
-- lands and the spinner is forever. Add a nullable failure-reason
-- column on competitor_media so the worker can record the error
-- inline; the UI then shows "Failed: <reason>" + a retry button
-- instead of an infinite spinner.
--
-- Also flip REPLICA IDENTITY to FULL so the drill-in page's realtime
-- subscription gets the user_id field on UPDATE events too (same
-- pattern as competitor_accounts in 20260520000004).

begin;

alter table public.competitor_media
  add column if not exists analysis_failed_reason text;

-- analysis_pending mirrors sync_pending on competitor_accounts: the
-- fan-out / manual action flips it true when emitting an analyse
-- event; the worker flips it back to false on success or failure.
-- Lets the UI distinguish "in-flight (show Analyzing...)" from "never
-- tried (show Analyze button)" since after the 5-reel auto-cap most
-- reels start in the never-tried state.
alter table public.competitor_media
  add column if not exists analysis_pending boolean not null default false;

alter table public.competitor_media replica identity full;

alter publication supabase_realtime add table public.competitor_media;

comment on column public.competitor_media.analysis_failed_reason is
  'Last analyzer failure message for this reel. Null = no failure (either succeeded, or never tried). Cleared on next success.';
comment on column public.competitor_media.analysis_pending is
  'True while an analyse Inngest run is in flight. Worker resets to false on success/failure.';

commit;
