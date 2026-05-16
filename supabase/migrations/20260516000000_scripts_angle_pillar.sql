-- Bot OS schema delta: scripts.angle + scripts.pillar (BO-056)
--
-- Adds the two columns the dashboard's Trust Funnel Balance chart and
-- pillar-distribution chart need to compute live metrics. Until now the
-- columns lived only on the in-memory `GeneratedScript` shape and were
-- discarded at insert time, so the dashboard hardcoded `angle: null` and
-- every user's funnel chart was empty.
--
-- Both columns are nullable so existing rows keep working — the
-- dashboard's tally already filters out nulls.
--
-- The angle check constraint mirrors the `ScriptAngle` union in
-- src/engines/content/types.ts so an inadvertently misspelled angle from
-- the model fails fast at write time rather than silently miscounting.

begin;

alter table public.scripts
  add column if not exists angle text,
  add column if not exists pillar text;

alter table public.scripts
  drop constraint if exists scripts_angle_check;

alter table public.scripts
  add constraint scripts_angle_check
  check (
    angle is null
    or angle in (
      'pain_point',
      'aspiration',
      'contrarian',
      'case_study',
      'framework',
      'story',
      'myth_buster'
    )
  );

-- The dashboard reads the most recent 12 rows per user and tallies by
-- angle. A partial index on the funnel columns scoped to non-null angle
-- keeps that lookup cheap as the library grows past the smoke-test
-- corpora.
create index if not exists scripts_user_created_funnel_idx
  on public.scripts (user_id, created_at desc)
  where angle is not null;

commit;
