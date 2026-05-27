-- Bot OS schema delta: add 'research' to ideas.source
--
-- The research surface can now turn a saved outlier reel into ideas in
-- the creator's own voice (see src/engines/content/outlier-idea-
-- generator.ts). Those land in the Ideas Bank tagged source='research'
-- so the bank shows where they came from and they read distinctly from
-- chat-captured ('chat') or hand-typed ('manual') ideas.
--
-- The existing CHECK only allowed ('chat', 'manual'); widen it. No data
-- migration needed - existing rows keep their source.

begin;

alter table public.ideas
  drop constraint if exists ideas_source_check;

alter table public.ideas
  add constraint ideas_source_check
  check (source in ('chat', 'manual', 'research'));

commit;
