-- Bot OS schema delta: instagram_follower_history
--
-- Stores a daily snapshot of followers_count per user. The dashboard's
-- "New Followers (30d)" metric is `latest - earliest` over the window,
-- which is impossible to compute from instagram_connections.followers_count
-- alone because that column is mutated in place every sync.
--
-- Granularity is one row per (user_id, captured_on date). If the user
-- triggers multiple syncs in a single day we overwrite the same row
-- with the latest count rather than appending; that keeps the table
-- bounded at ~365 rows per user per year and matches the resolution
-- we actually render in the UI.

begin;

create table public.instagram_follower_history (
    user_id          uuid not null references auth.users (id) on delete cascade,
    captured_on      date not null,
    followers_count  integer not null,
    captured_at      timestamptz not null default now(),
    primary key (user_id, captured_on),
    constraint instagram_follower_history_count_nonneg
      check (followers_count >= 0)
);

comment on table  public.instagram_follower_history is 'Daily snapshot of followers_count per user. Powers the New Followers (30d) dashboard metric.';
comment on column public.instagram_follower_history.captured_on is 'UTC calendar date of the snapshot. Composite PK with user_id so re-syncs the same day overwrite.';
comment on column public.instagram_follower_history.captured_at is 'Wall-clock timestamp of the most recent write for this (user, day) pair.';

create index instagram_follower_history_user_captured_idx
  on public.instagram_follower_history (user_id, captured_on desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.instagram_follower_history enable row level security;
alter table public.instagram_follower_history force  row level security;

create policy instagram_follower_history_select_own
  on public.instagram_follower_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy instagram_follower_history_insert_self
  on public.instagram_follower_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy instagram_follower_history_update_own
  on public.instagram_follower_history for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy instagram_follower_history_delete_own
  on public.instagram_follower_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.instagram_follower_history to authenticated;
grant all on public.instagram_follower_history to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe the new table too. Order matters: we
-- delete from this table before instagram_connections so an FK-shaped
-- future change doesn't trip the GDPR wipe.
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

  delete from public.instagram_follower_history where user_id = target_user_id;
  delete from public.instagram_media              where user_id = target_user_id;
  delete from public.instagram_connections        where user_id = target_user_id;
  delete from public.user_methodology             where user_id = target_user_id;
  delete from public.user_memories                where user_id = target_user_id;
  delete from public.ideas                        where user_id = target_user_id;
  delete from public.messages                     where user_id = target_user_id;
  delete from public.conversations                where user_id = target_user_id;
  delete from public.scripts                      where user_id = target_user_id;
  delete from public.script_batches               where user_id = target_user_id;
  delete from public.voice_dna                    where user_id = target_user_id;
  delete from public.profiles                     where id      = target_user_id;
  delete from auth.users                          where id      = target_user_id;
end;
$$;

commit;
