-- Bot OS schema delta: widen performance_score from 0-10 to 0-100.
--
-- Renaming the semantic only: same library-relative engagement signal,
-- now expressed as a true reach percentile (0 = bottom of this
-- creator's library by reach, 100 = top) rather than a coarse 0-10
-- bucket. UI labels it "Reach" to avoid implying content quality.
--
-- Migration strategy: drop the old CHECK, scale existing rows by 10,
-- add the new CHECK. Existing 0-10 rows become 0/10/.../100 so they
-- stay valid; finer-grained values land on new analyses.
--
-- The smallint type already accepts 0-100. Column type stays the same.

begin;

alter table public.instagram_media_analysis
  drop constraint if exists instagram_media_analysis_performance_score_check;

alter table public.competitor_media_analysis
  drop constraint if exists competitor_media_analysis_performance_score_check;

update public.instagram_media_analysis
  set performance_score = performance_score * 10
  where performance_score is not null and performance_score <= 10;

update public.competitor_media_analysis
  set performance_score = performance_score * 10
  where performance_score is not null and performance_score <= 10;

alter table public.instagram_media_analysis
  add constraint instagram_media_analysis_performance_score_check
    check (performance_score is null or (performance_score between 0 and 100));

alter table public.competitor_media_analysis
  add constraint competitor_media_analysis_performance_score_check
    check (performance_score is null or (performance_score between 0 and 100));

comment on column public.instagram_media_analysis.performance_score is
  '0-100 library-relative reach percentile. 100 = top of this library by reach, 0 = bottom. Null when sample too small or reach absent.';
comment on column public.competitor_media_analysis.performance_score is
  '0-100 library-relative reach percentile within the competitor''s own reel distribution.';

commit;
