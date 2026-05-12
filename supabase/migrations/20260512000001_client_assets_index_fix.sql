-- Bot OS migration: client_assets unique index correction
--
-- The original migration 20260512000000 declared a partial unique index:
--
--   create unique index client_assets_user_source_file_unique
--     on public.client_assets (user_id, source_file)
--     where source_file is not null;
--
-- Postgres does not allow partial indexes as ON CONFLICT targets, so the
-- `.upsert(rows, { onConflict: "user_id,source_file" })` call from the
-- ingestion CLI fails with:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Drop the partial form and recreate as a regular unique index. NULL
-- handling stays correct under Postgres's default NULLS DISTINCT
-- semantics: a row whose source_file is NULL never collides with
-- another NULL-source row, so assets without a path keep behaving as
-- "always insert". Rows with a path still get the (user_id,source_file)
-- uniqueness needed for idempotent re-ingest.

begin;

drop index if exists public.client_assets_user_source_file_unique;

create unique index client_assets_user_source_file_unique
  on public.client_assets (user_id, source_file);

commit;
