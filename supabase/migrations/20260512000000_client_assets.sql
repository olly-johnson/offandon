-- Bot OS schema delta: client_assets
--
-- Operator-curated reference material that powers per-client script
-- generation but doesn't fit into voice_dna (a single distilled identity)
-- or user_memories (small atomic facts). Populated by the BO-042 ingestion
-- CLI from local files under clients/<slug>/.
--
-- Asset types kept deliberately coarse so a single jsonb metadata column
-- can carry type-specific structure:
--
--   story            structured story bank entry. metadata holds
--                    { category, funnel_fit, emotions[], universal_truth,
--                      times_used } — preserves the shape from clients/
--                    story_bank.md without spawning four typed columns the
--                    LLM has to fill perfectly.
--   viral_reference  external creator's viral piece + breakdown. metadata
--                    holds { creator, platform, url, why_it_worked }.
--   past_script      a piece the creator wrote and approved. metadata holds
--                    { format, performance } where present.
--   template         a hook / structure template the creator likes.
--                    metadata holds { funnel_fit } where present.
--
-- ScriptGenerator pulls relevant assets per surface (funnel-matched stories,
-- a handful of viral references, etc.) into the system prompt at generation
-- time. Per-user volume is bounded (15-50 rows is normal) so we don't need
-- vector search yet — naive filtered fetch is fine.
--
-- title + body are required so a future search index has fields to grip.
-- source_file is the path the row was ingested from (e.g.
-- 'story_bank.md#getting-kicked-out-at-16') and the upsert key for re-runs.

begin;

create table public.client_assets (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    asset_type  text not null
      check (asset_type in ('story', 'viral_reference', 'past_script', 'template')),
    title       text not null,
    body        text not null,
    metadata    jsonb not null default '{}'::jsonb,
    source_file text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint client_assets_title_not_blank check (length(btrim(title))  > 0),
    constraint client_assets_body_not_blank  check (length(btrim(body))   > 0)
);

-- Idempotent re-ingestion: (user_id, source_file) keys the upsert when
-- the operator re-runs `ingest:commit` after editing .extracted.json.
-- source_file is nullable for assets that don't come from a single file
-- (e.g. consolidated entries pasted via the future admin UI); those use
-- the unconditional insert path instead of upsert.
create unique index client_assets_user_source_file_unique
  on public.client_assets (user_id, source_file)
  where source_file is not null;

create index client_assets_user_type_idx
  on public.client_assets (user_id, asset_type, created_at desc);

comment on table  public.client_assets is 'Operator-curated reference material per user (stories, viral references, past scripts, templates). Loaded into script-generation prompts at runtime.';
comment on column public.client_assets.metadata is 'Type-specific structured fields. Shape varies by asset_type — see migration header.';
comment on column public.client_assets.source_file is 'Path under clients/<slug>/ this row was extracted from. Upsert key for idempotent re-ingest.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create trigger client_assets_set_updated_at
  before update on public.client_assets
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client_assets enable row level security;
alter table public.client_assets force  row level security;

-- Users see their own assets. Writes happen via service_role from the
-- ingestion CLI; an authenticated user has no path to mutate these from
-- the client. If a future feature adds in-app editing it gets explicit
-- insert/update/delete policies then.
create policy client_assets_select_own
  on public.client_assets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF — see init migration)
-- ---------------------------------------------------------------------------
grant select on public.client_assets to authenticated;
grant all on public.client_assets to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe client_assets.
--
-- Insertion order in the function preserves FK safety: child rows go
-- before parent rows. client_assets has no children, so it goes near the
-- top alongside the other leaf tables.
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

  delete from public.client_assets         where user_id = target_user_id;
  delete from public.admin_invites         where invited_by = target_user_id;
  delete from public.instagram_media       where user_id = target_user_id;
  delete from public.instagram_connections where user_id = target_user_id;
  delete from public.user_methodology      where user_id = target_user_id;
  delete from public.user_memories         where user_id = target_user_id;
  delete from public.ideas                 where user_id = target_user_id;
  delete from public.messages              where user_id = target_user_id;
  delete from public.conversations         where user_id = target_user_id;
  delete from public.scripts               where user_id = target_user_id;
  delete from public.script_batches        where user_id = target_user_id;
  delete from public.voice_dna             where user_id = target_user_id;
  delete from public.profiles              where id      = target_user_id;
  delete from auth.users                   where id      = target_user_id;
end;
$$;

commit;
