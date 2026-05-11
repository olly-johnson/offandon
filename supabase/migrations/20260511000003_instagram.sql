-- Bot OS schema delta: Instagram integration (BO-005)
--
-- Two tables:
--   instagram_connections  one row per user; the IG access token + the
--                          last-known top-level account stats
--                          (followers_count, media_count). Long-lived
--                          tokens last 60 days; the refresh job updates
--                          last_synced_at as it goes.
--   instagram_media        one row per published post / reel. Re-synced
--                          nightly + on manual refresh. Primary key is the
--                          IG media id (string) so upserts are trivial.
--
-- Security note: the access token is stored as TEXT in plaintext. For a
-- single-user MVP behind RLS this is acceptable; the real fix is
-- pgsodium / Supabase Vault encryption-at-rest, which is a follow-up.
-- The token gives full read+insights access to one Instagram account;
-- treat the DB rows accordingly.
--
-- Sync model is replace-by-upsert: every refresh fetches the latest N
-- media + insights and upserts on instagram_media.id. We never DELETE
-- rows here; old posts that fall out of the recent N just stop being
-- updated. A future cleanup job can prune anything not seen in 90 days.

begin;

-- ---------------------------------------------------------------------------
-- instagram_connections
-- ---------------------------------------------------------------------------
create table public.instagram_connections (
    user_id          uuid primary key references auth.users (id) on delete cascade,
    access_token     text not null,
    ig_user_id       text not null,
    ig_username      text,
    followers_count  integer,
    follows_count    integer,
    media_count      integer,
    last_synced_at   timestamptz,
    last_sync_error  text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint instagram_connections_token_not_blank
      check (length(btrim(access_token)) > 0),
    constraint instagram_connections_ig_user_id_not_blank
      check (length(btrim(ig_user_id)) > 0)
);

comment on table  public.instagram_connections is 'One row per user; their Instagram Graph API connection + last-known top-level stats.';
comment on column public.instagram_connections.access_token is 'Long-lived token. Plaintext for now; future move to pgsodium / Vault.';
comment on column public.instagram_connections.last_synced_at is 'Null until the first successful sync. Drives the 24h refresh cache.';
comment on column public.instagram_connections.last_sync_error is 'Last error message if the most recent sync failed. Cleared on next success.';

create trigger instagram_connections_set_updated_at
  before update on public.instagram_connections
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- instagram_media
-- ---------------------------------------------------------------------------
create table public.instagram_media (
    id              text primary key,
    user_id         uuid not null references auth.users (id) on delete cascade,
    media_type      text not null check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REELS')),
    caption         text,
    permalink       text,
    media_url       text,
    thumbnail_url   text,
    posted_at       timestamptz,
    like_count      integer,
    comments_count  integer,
    reach           integer,
    plays           integer,
    saved           integer,
    shares          integer,
    synced_at       timestamptz not null default now()
);

create index instagram_media_user_id_posted_at_idx
  on public.instagram_media (user_id, posted_at desc nulls last);

comment on table  public.instagram_media is 'One row per published IG post / reel. Upserted on every sync. Old rows are not pruned.';
comment on column public.instagram_media.id is 'IG media id (string). Stable across syncs; primary key for upsert.';
comment on column public.instagram_media.media_type is 'IG media_type. REELS is technically a sub-type of VIDEO but we surface it separately for the library grid.';
comment on column public.instagram_media.synced_at is 'When we last refreshed this row. A future job can prune rows older than 90 days.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.instagram_connections enable row level security;
alter table public.instagram_connections force  row level security;
alter table public.instagram_media       enable row level security;
alter table public.instagram_media       force  row level security;

create policy instagram_connections_select_own
  on public.instagram_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_connections_insert_self
  on public.instagram_connections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy instagram_connections_update_own
  on public.instagram_connections for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy instagram_connections_delete_own
  on public.instagram_connections for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_media_select_own
  on public.instagram_media for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_media_insert_self
  on public.instagram_media for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy instagram_media_update_own
  on public.instagram_media for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy instagram_media_delete_own
  on public.instagram_media for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.instagram_connections to authenticated;
grant select, insert, update, delete on public.instagram_media to authenticated;
grant all on public.instagram_connections to service_role;
grant all on public.instagram_media       to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe IG state
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

  delete from public.instagram_media        where user_id = target_user_id;
  delete from public.instagram_connections  where user_id = target_user_id;
  delete from public.user_methodology       where user_id = target_user_id;
  delete from public.user_memories          where user_id = target_user_id;
  delete from public.ideas                  where user_id = target_user_id;
  delete from public.messages               where user_id = target_user_id;
  delete from public.conversations          where user_id = target_user_id;
  delete from public.scripts                where user_id = target_user_id;
  delete from public.script_batches         where user_id = target_user_id;
  delete from public.voice_dna              where user_id = target_user_id;
  delete from public.profiles               where id      = target_user_id;
  delete from auth.users                    where id      = target_user_id;
end;
$$;

commit;
