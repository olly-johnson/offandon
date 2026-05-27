-- Bot OS schema delta: store the IG profile picture URL.
--
-- The brand dashboard header shows the creator's Instagram avatar in place
-- of the initial-letter fallback. The Graph API exposes it on /me as
-- `profile_picture_url`; we persist the latest value on the connection row
-- and refresh it every sync.
--
-- Note: IG profile picture URLs are short-lived signed CDN links. They are
-- refreshed on each sync (nightly + manual), so the stored value stays
-- usable between syncs. The dashboard avatar falls back to the initial if
-- the URL has expired by render time.

begin;

alter table public.instagram_connections
  add column if not exists ig_profile_picture_url text;

comment on column public.instagram_connections.ig_profile_picture_url is
  'Latest IG profile picture URL from /me. Short-lived CDN link; refreshed each sync. UI falls back to an initial when null/expired.';

commit;
