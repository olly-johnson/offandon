-- Bot OS storage delta: public bucket for cached competitor reel
-- thumbnails. TikTok cover URLs are short-lived signed CDN links that
-- expire within hours; the scrape-completed Inngest function copies
-- each cover here while the URL is still valid and stores the stable
-- public URL on competitor_media.thumbnail_url. See
-- src/engines/competitor/thumbnail-cache.ts.
--
-- Public-read because the covers are surfaced in the client and carry
-- no per-user secrets (the object key is the public reel id). Writes
-- are service-role only (no insert/update/delete policies for anon or
-- authenticated), so the only writer is the Inngest worker running
-- with the service-role key.

begin;

insert into storage.buckets (id, name, public)
values ('competitor-thumbnails', 'competitor-thumbnails', true)
on conflict (id) do update set public = excluded.public;

-- Public read for everyone (anon + authenticated). Idempotent via a
-- name check; running this migration twice is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Competitor thumbnails are publicly readable'
  ) then
    create policy "Competitor thumbnails are publicly readable"
      on storage.objects
      for select
      using (bucket_id = 'competitor-thumbnails');
  end if;
end$$;

commit;
