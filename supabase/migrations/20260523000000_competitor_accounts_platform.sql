-- Bot OS schema delta: per-competitor platform tracking.
--
-- Adds a platform column to competitor_accounts so the same dashboard
-- can pin Instagram, TikTok, and YouTube Shorts creators side by
-- side. Existing rows default to 'instagram' (back-compat: every row
-- in the table today was added under the IG-only flow).
--
-- Uniqueness widens from (user_id, username) to
-- (user_id, platform, username), so a user can track e.g. @hormozi
-- on both IG and TT without a constraint conflict. The old
-- uniqueness is dropped if it existed.
--
-- The downstream scrape workers and the outlier feed read this
-- column directly; no separate join required.

begin;

alter table public.competitor_accounts
  add column if not exists platform text not null default 'instagram'
    check (platform in ('instagram', 'tiktok', 'youtube_shorts'));

-- Drop the old (user_id, username) uniqueness whatever name it has.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.competitor_accounts'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(user_id, username)%'
  loop
    execute format('alter table public.competitor_accounts drop constraint %I', c.conname);
  end loop;
end$$;

-- New uniqueness includes platform so the same handle can be tracked
-- on multiple platforms by the same user.
alter table public.competitor_accounts
  drop constraint if exists competitor_accounts_user_platform_username_key;
alter table public.competitor_accounts
  add constraint competitor_accounts_user_platform_username_key
    unique (user_id, platform, username);

comment on column public.competitor_accounts.platform is
  'Source platform for this competitor. Determines which Apify actor scrapes them and which parser ingests the dataset.';

commit;
