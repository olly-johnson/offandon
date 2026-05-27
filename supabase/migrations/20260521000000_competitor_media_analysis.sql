-- Bot OS schema delta: competitor_media_analysis (BO-063)
--
-- Per-reel analysis output for tracked competitors. One analysis row
-- per competitor_media row; the FK uses the Apify shortcode (the
-- competitor_media primary key) so re-analysis is an upsert and
-- there's no ambiguity about which reel a row belongs to.
--
-- All writes happen from the Inngest analyze-competitor-media function
-- under the service-role client. The RLS policy grants SELECT-own only
-- so the drill-in page can fetch and render. user_id is denormalised
-- onto every row so RLS doesn't need to join through competitor_media.
--
-- Reuses research_analysis_runs (BO-043) for the rolling-30d rate
-- limiter; no new audit table needed because the limiter is per-user,
-- not per-surface.

begin;

create table public.competitor_media_analysis (
    media_id          text primary key
                         references public.competitor_media (id) on delete cascade,
    competitor_id     uuid not null
                         references public.competitor_accounts (id) on delete cascade,
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
    constraint competitor_media_analysis_transcript_not_blank
      check (length(btrim(transcript)) > 0)
);

create index competitor_media_analysis_competitor_analyzed_at_idx
  on public.competitor_media_analysis (competitor_id, analyzed_at desc);

create index competitor_media_analysis_user_idx
  on public.competitor_media_analysis (user_id);

comment on table  public.competitor_media_analysis is 'One row per analyzed competitor reel. Written by analyze-competitor-media Inngest function under service-role.';
comment on column public.competitor_media_analysis.performance_label is 'Library-relative bucket. One of: top, above_median, median, below_median, bottom. Computed against the competitor''s OWN reel distribution, not the user''s.';
comment on column public.competitor_media_analysis.transcript_model is 'Transcription provider id, e.g. deepgram-nova-3. Pinned so re-analysis is reproducible.';

-- ---------------------------------------------------------------------------
-- RLS + grants — same pattern as instagram_media_analysis: SELECT-own,
-- writes are service-role only via the Inngest worker.
-- ---------------------------------------------------------------------------
alter table public.competitor_media_analysis enable row level security;
alter table public.competitor_media_analysis force  row level security;

create policy competitor_media_analysis_select_own
  on public.competitor_media_analysis for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.competitor_media_analysis to authenticated;
grant all    on public.competitor_media_analysis to service_role;

-- ---------------------------------------------------------------------------
-- Realtime publication: drill-in page subscribes to INSERT events so
-- the "Analyzing..." spinners on each tile clear the moment an
-- analysis row lands. INSERTs include the full row by default, so no
-- REPLICA IDENTITY FULL needed here.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.competitor_media_analysis;

-- ---------------------------------------------------------------------------
-- delete_user_data: extend with competitor_media_analysis. Inserted at
-- the front so it goes before competitor_media (its parent via FK).
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

  delete from public.competitor_media_analysis where user_id = target_user_id;
  delete from public.competitor_media          where user_id = target_user_id;
  delete from public.competitor_accounts       where user_id = target_user_id;
  delete from public.weekly_checkins           where user_id = target_user_id;
  delete from public.client_document_chunks    where user_id = target_user_id;
  delete from public.client_documents          where user_id = target_user_id;
  delete from public.api_usage                 where user_id = target_user_id;
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
