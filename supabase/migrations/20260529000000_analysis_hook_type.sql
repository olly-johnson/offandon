-- Bot OS schema delta: classify hook archetype during analysis
--
-- The analyzer now tags each reel's opener with a hook archetype
-- (STORYTELLING / CONFRONTATIONAL / VULNERABILITY / CURIOSITY / PROOF /
-- EDUCATIONAL), powering the "type of hooks that are working" dimension
-- of the research trends surface. Added to both analysis tables so the
-- shared MediaAnalyzer output persists on either path. Nullable: existing
-- rows stay null until re-analysed, and a reel with no readable hook
-- carries null. CHECK allows null (NULL IN (...) passes).

begin;

alter table public.competitor_media_analysis
  add column if not exists hook_type text
  check (
    hook_type in (
      'STORYTELLING', 'CONFRONTATIONAL', 'VULNERABILITY',
      'CURIOSITY', 'PROOF', 'EDUCATIONAL'
    )
  );

alter table public.instagram_media_analysis
  add column if not exists hook_type text
  check (
    hook_type in (
      'STORYTELLING', 'CONFRONTATIONAL', 'VULNERABILITY',
      'CURIOSITY', 'PROOF', 'EDUCATIONAL'
    )
  );

commit;
