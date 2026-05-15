-- Bot OS schema delta: client_documents unique index fix (BO-052 follow-up)
--
-- The original index in migration 20260515000000_client_corpus.sql was:
--
--   create unique index client_documents_user_source_path_unique
--     on public.client_documents (user_id, source_path)
--     where source_path is not null;
--
-- Partial indexes only match an INSERT's ON CONFLICT clause when the WHERE
-- predicate is repeated literally inside that clause. supabase-js's
-- `.upsert({ onConflict: "user_id,source_path" })` does not expose the
-- predicate, so every corpus ingestion run failed with:
--
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- Replacing the partial index with a full unique index makes the upsert
-- path match. The original intent (rows with a null source_path are
-- allowed to coexist) is preserved by Postgres's default NULLS DISTINCT
-- semantics on unique indexes — multiple `(user_id, NULL)` rows for the
-- same user are still permitted.

begin;

drop index if exists public.client_documents_user_source_path_unique;

create unique index client_documents_user_source_path_unique
  on public.client_documents (user_id, source_path);

commit;
