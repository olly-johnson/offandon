-- Bot OS schema delta: competitor_media (BO-062)
--
-- One row per scraped reel from a tracked competitor. Populated by the
-- Apify "instagram-reel-scraper" actor via /api/apify/webhook. The id
-- is the Apify shortcode (the slug after instagram.com/p/) so re-runs
-- upsert in place and we never grow duplicates.
--
-- Schema mirrors instagram_media so the existing MediaAnalyzer flow
-- (Deepgram transcribe -> Sonnet structural analysis) can be reused in
-- BO-063 against this table with minimal divergence.
--
-- user_id is denormalised onto every row so RLS does not need to join
-- to competitor_accounts on every query. competitor_id is the real FK;
-- ON DELETE CASCADE means "untrack a competitor" wipes their media too.

begin;

create table public.competitor_media (
    id                   text primary key,
    competitor_id        uuid not null references public.competitor_accounts (id) on delete cascade,
    user_id              uuid not null references auth.users (id) on delete cascade,
    media_type           text not null check (media_type in ('VIDEO', 'REELS', 'IMAGE', 'CAROUSEL_ALBUM')),
    caption              text,
    permalink            text,
    media_url            text,
    thumbnail_url        text,
    posted_at            timestamptz,
    like_count           integer,
    comments_count       integer,
    view_count           integer,
    duration_seconds     numeric(8,2),
    scrape_run_id        text,
    synced_at            timestamptz not null default now()
);

create index competitor_media_competitor_posted_at_idx
  on public.competitor_media (competitor_id, posted_at desc nulls last);

create index competitor_media_user_id_idx
  on public.competitor_media (user_id);

comment on table  public.competitor_media is 'One row per reel scraped from a tracked competitor. Upserted on every Apify run. Old rows are not pruned.';
comment on column public.competitor_media.id is 'Apify reel shortcode. Stable across scrapes; primary key for upsert.';
comment on column public.competitor_media.media_url is 'Direct mp4 URL from Apify. Expires; treat as one-shot for Deepgram, then forget.';
comment on column public.competitor_media.scrape_run_id is 'Apify actor run id that produced this row. For ops tracing.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.competitor_media enable row level security;
alter table public.competitor_media force  row level security;

create policy competitor_media_select_own
  on public.competitor_media for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Writes are service-role only (Inngest worker via admin client). No
-- authenticated insert/update/delete policy so the user can't fabricate
-- rows for a competitor they don't own.
grant select on public.competitor_media to authenticated;
grant all    on public.competitor_media to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: extend with competitor_media. Inserted ahead of
-- competitor_accounts so the child rows go first.
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
