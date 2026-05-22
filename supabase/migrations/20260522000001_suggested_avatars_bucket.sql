-- Bot OS storage delta: public bucket for curated suggested-creator
-- avatars surfaced on /research (Step 1). Public-read because the
-- avatars are content-addressed by handle and surfaced in the
-- client; no per-user authorisation needed. Writes are service-role
-- only (no insert/update/delete policies for anon/authenticated),
-- so the only path to populate is via Studio drag-drop or a script
-- running with the service-role key. Refresh cadence is operator
-- choice; the files rarely change so no automated cron.

begin;

insert into storage.buckets (id, name, public)
values ('suggested-avatars', 'suggested-avatars', true)
on conflict (id) do update set public = excluded.public;

-- Public read for everyone (anon + authenticated). Idempotent via
-- a name check; running this migration twice is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Suggested avatars are publicly readable'
  ) then
    create policy "Suggested avatars are publicly readable"
      on storage.objects
      for select
      using (bucket_id = 'suggested-avatars');
  end if;
end$$;

commit;
