-- Bot OS schema delta: weekly_checkins (BO-057)
--
-- One row per user per ISO week, populated by the Google Forms webhook
-- (/api/weekly-checkin/webhook). Drives two things:
--   1. Saturday reminder: skip users whose row already exists for the
--      current week_start.
--   2. Voice DNA refresh: on insert the webhook emits
--      voice/dna.refresh.requested so the corpus picks up the new
--      questionnaire and Voice DNA is regenerated with the accumulated
--      weekly answers.
--
-- week_start is the Monday of the ISO week the response was submitted
-- in, derived server-side from submitted_at so a user can't bypass the
-- uniqueness constraint by editing the "week ending" field on the form.
-- raw_responses is the verbatim JSON shape pushed by Apps Script —
-- normalisation happens in the engine layer, not the schema.

begin;

create table public.weekly_checkins (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    week_start      date not null,
    raw_responses   jsonb not null default '{}'::jsonb,
    submitted_at    timestamptz not null default now(),
    created_at      timestamptz not null default now()
);

create unique index weekly_checkins_user_week_unique
  on public.weekly_checkins (user_id, week_start);

create index weekly_checkins_user_submitted_at_idx
  on public.weekly_checkins (user_id, submitted_at desc);

comment on table  public.weekly_checkins is 'Friday weekly questionnaire submissions, one row per (user, ISO week).';
comment on column public.weekly_checkins.week_start    is 'Monday of the ISO week the response landed in. Server-derived.';
comment on column public.weekly_checkins.raw_responses is 'Verbatim JSON payload from the Google Forms Apps Script webhook.';

-- ---------------------------------------------------------------------------
-- RLS — users may read their own check-ins; writes are service-role only
-- (Apps Script -> webhook -> admin client). No update/delete via the API.
-- ---------------------------------------------------------------------------
alter table public.weekly_checkins enable row level security;
alter table public.weekly_checkins force  row level security;

create policy weekly_checkins_select_own
  on public.weekly_checkins for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select                         on public.weekly_checkins to authenticated;
grant select, insert, update, delete on public.weekly_checkins to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: extend with weekly_checkins. Adds at the front so the
-- delete order keeps following "children before parents".
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
