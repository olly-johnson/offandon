-- Bot OS schema delta: add performance_score (0-10) to both analysis tables.
--
-- Replacing the library-relative bucket label
-- ("top"/"above_median"/...) with a 0-10 integer score. Same semantic
-- (10 = top of this library's engagement distribution, 0 = bottom);
-- finer granularity and renders cleaner as a badge.
--
-- We keep performance_label on both tables for now so older rows
-- aren't lost — new rows write performance_score and the UI reads
-- only that. A follow-up migration can drop the legacy column once
-- every active row has been re-analysed (or backfilled).

begin;

alter table public.instagram_media_analysis
  add column if not exists performance_score smallint
    check (performance_score is null or (performance_score between 0 and 10));

alter table public.competitor_media_analysis
  add column if not exists performance_score smallint
    check (performance_score is null or (performance_score between 0 and 10));

comment on column public.instagram_media_analysis.performance_score is
  '0-10 library-relative engagement score. 10 = top of this library, 0 = bottom. Null when sample too small or transcript too poor for a confident read.';
comment on column public.competitor_media_analysis.performance_score is
  '0-10 library-relative engagement score within the competitor''s own reel distribution. 10 = top, 0 = bottom.';

commit;
