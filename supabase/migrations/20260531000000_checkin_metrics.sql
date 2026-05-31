-- Bot OS schema delta: structured weekly-check-in metrics (BO-076)
--
-- The weekly check-in already stores every answer in raw_responses
-- (jsonb), but those are prose keyed by question label. To chart a
-- creator's week-over-week growth we extract the numeric outcomes at
-- ingest (in the GHL / Google-Form webhook) and persist them as typed
-- columns on the same row. One check-in = one row, so columns (not a
-- side table) keep the 1:1 relationship and avoid a join.
--
-- All nullable: a messy or missing answer parses to NULL rather than
-- failing the whole check-in. Existing rows stay NULL (no backfill).
-- Revenue is captured but the dashboard card deliberately does not chart
-- it. satisfaction is the 1-10 service rating; the extractor clamps out
-- of range to NULL so the CHECK can't break an ingest.

begin;

alter table public.weekly_checkins
  add column if not exists new_followers   integer,
  add column if not exists dms_received    integer,
  add column if not exists calls_booked    integer,
  add column if not exists sales_closed    integer,
  add column if not exists leads_generated integer,
  add column if not exists revenue         numeric,
  add column if not exists posts_published integer,
  add column if not exists satisfaction    integer;

alter table public.weekly_checkins
  drop constraint if exists weekly_checkins_satisfaction_range,
  add constraint weekly_checkins_satisfaction_range
    check (satisfaction is null or (satisfaction between 1 and 10));

comment on column public.weekly_checkins.new_followers   is 'Self-reported new followers this week (BO-076). Parsed from the check-in; NULL if unparseable.';
comment on column public.weekly_checkins.revenue         is 'Self-reported revenue from personal brand. Captured but NOT charted on the dashboard (sensitive).';
comment on column public.weekly_checkins.posts_published is 'Sum of post counts parsed from the "what content did you post" answer.';
comment on column public.weekly_checkins.satisfaction    is '1-10 service-satisfaction rating. Out-of-range parses to NULL.';

commit;
