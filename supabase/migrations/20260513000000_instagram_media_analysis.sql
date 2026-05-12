-- Bot OS schema delta: instagram_media_analysis + research_analysis_runs
--
-- Per-video analysis output for the user's own Instagram library
-- (BO-043). One analysis row per media row; the FK uses the IG media id
-- as the primary key so re-analysis is an upsert and there's no
-- ambiguity about which media a row belongs to.
--
-- All writes happen from the Inngest `analyze-media` function under the
-- service-role client (the function has no end-user JWT in scope). The
-- RLS policies grant SELECT-own only so the UI can fetch and render.
--
-- research_analysis_runs is the audit log used by the per-user rolling
-- 30-day rate limit. Each successful analysis writes one row; the
-- limiter counts rows since (now() - 30 days). Same pattern as
-- admin_invites from BO-013.

begin;

-- ---------------------------------------------------------------------------
-- instagram_media_analysis
-- ---------------------------------------------------------------------------
create table public.instagram_media_analysis (
    media_id          text primary key
                         references public.instagram_media (id) on delete cascade,
    user_id           uuid not null references auth.users (id) on delete cascade,
    transcript        text not null,
    hook              text,
    structure         text,
    pillar_match      text,
    performance_label text,
    what_worked       text,
    what_to_repeat    text,
    llm_model         text not null,
    transcript_model  text not null,
    analyzed_at       timestamptz not null default now(),
    constraint instagram_media_analysis_transcript_not_blank
      check (length(btrim(transcript)) > 0)
);

create index instagram_media_analysis_user_analyzed_at_idx
  on public.instagram_media_analysis (user_id, analyzed_at desc);

comment on table  public.instagram_media_analysis is 'One row per analyzed video. Written by the analyze-media Inngest function under service-role.';
comment on column public.instagram_media_analysis.performance_label is 'Library-relative bucket. One of: top, above_median, median, below_median, bottom. Computed at analysis time off the user''s own reach percentiles.';
comment on column public.instagram_media_analysis.transcript_model is 'Transcription provider id, e.g. deepgram-nova-3. Pinned so re-analysis is reproducible.';

-- ---------------------------------------------------------------------------
-- research_analysis_runs (rolling-window rate limit log)
-- ---------------------------------------------------------------------------
create table public.research_analysis_runs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    media_id    text not null,
    created_at  timestamptz not null default now()
);

create index research_analysis_runs_user_created_at_idx
  on public.research_analysis_runs (user_id, created_at desc);

comment on table  public.research_analysis_runs is 'Audit log for the rolling-30d analysis rate limit. One row per successful analysis; the limiter counts rows newer than (now() - 30d).';

-- ---------------------------------------------------------------------------
-- RLS + grants
--
-- instagram_media_analysis: SELECT own; service-role does all writes via
-- the Inngest function. Re-analysis is an UPDATE-after-DELETE pattern
-- the function handles; users can't mutate.
--
-- research_analysis_runs: writes are service-role only; no read for
-- authenticated either (it's an audit log; the user doesn't need to see
-- their own quota usage in v1).
-- ---------------------------------------------------------------------------
alter table public.instagram_media_analysis enable row level security;
alter table public.instagram_media_analysis force  row level security;
alter table public.research_analysis_runs   enable row level security;
alter table public.research_analysis_runs   force  row level security;

create policy instagram_media_analysis_select_own
  on public.instagram_media_analysis for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- research_analysis_runs has NO authenticated policies; access via
-- service_role only. The grants below match.

grant select on public.instagram_media_analysis to authenticated;
grant all    on public.instagram_media_analysis to service_role;
grant all    on public.research_analysis_runs   to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe research state
--
-- Insertion order keeps FK safety: media_analysis cascades via
-- instagram_media (already wiped further down), but we drop it
-- explicitly here so the wipe order is human-readable and survives any
-- future FK changes. research_analysis_runs has no children.
-- ---------------------------------------------------------------------------
create or replace function public.delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  is_service boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if not is_service and (caller is null or caller <> target_user_id) then
    raise exception 'insufficient_privilege: caller % cannot delete user %', caller, target_user_id
      using errcode = '42501';
  end if;

  delete from public.research_analysis_runs    where user_id = target_user_id;
  delete from public.instagram_media_analysis  where user_id = target_user_id;
  delete from public.client_assets             where user_id = target_user_id;
  delete from public.admin_invites             where invited_by = target_user_id;
  delete from public.instagram_media           where user_id = target_user_id;
  delete from public.instagram_connections     where user_id = target_user_id;
  delete from public.user_methodology          where user_id = target_user_id;
  delete from public.user_memories             where user_id = target_user_id;
  delete from public.ideas                     where user_id = target_user_id;
  delete from public.messages                  where user_id = target_user_id;
  delete from public.conversations             where user_id = target_user_id;
  delete from public.scripts                   where user_id = target_user_id;
  delete from public.script_batches            where user_id = target_user_id;
  delete from public.voice_dna                 where user_id = target_user_id;
  delete from public.profiles                  where id      = target_user_id;
  delete from auth.users                       where id      = target_user_id;
end;
$$;

commit;
