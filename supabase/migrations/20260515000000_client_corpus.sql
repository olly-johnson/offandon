-- Bot OS schema delta: client_corpus (BO-049)
--
-- Two-tier client information model. Tier 1 — voice_dna / user_methodology /
-- user_memories / client_assets — stays small and is loaded verbatim into the
-- system prompt on every chat + script turn. Tier 2 is THIS migration: the
-- full raw corpus (Fathom transcripts, weekly questionnaires, long-form
-- notes) lives here, gets chunked + embedded, and is retrieved on demand.
--
-- Chat surface (explicit): the chat-engine registers a `search_client_corpus`
-- tool; the LLM calls it when the user references a specific past artifact.
-- Script surface (implicit): script-generator embeds the seed prompt at
-- gen start and pulls top-k chunks into the system prompt.
--
-- Per-user volumes are now expected to grow weekly (new questionnaire +
-- 1-3 Fathom calls), so vector search is warranted — keyword/recency
-- retrieval over a long-tail transcript corpus misses too much.
--
--   client_documents          one row per ingested raw artifact. Holds the
--                             full text + source classification. Append-only;
--                             re-ingest replaces by (user_id, source_path).
--
--   client_document_chunks    embedded chunks (~800 tokens). HNSW index on
--                             embedding for cosine similarity retrieval.
--                             Cascaded delete from parent document.
--
-- Source types deliberately distinct from client_assets.asset_type. client_
-- assets is curated reference (operator-edited, capped, prompt-injected).
-- client_documents is the firehose (raw, large, retrieved-only).

begin;

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- client_documents
-- ---------------------------------------------------------------------------
create table public.client_documents (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    source_type   text not null
      check (source_type in (
        'fathom_transcript',
        'questionnaire',
        'note',
        'long_form'
      )),
    title         text not null,
    body          text not null,
    captured_at   timestamptz not null default now(),
    source_path   text,
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint client_documents_title_not_blank check (length(btrim(title)) > 0),
    constraint client_documents_body_not_blank  check (length(btrim(body))  > 0)
);

create unique index client_documents_user_source_path_unique
  on public.client_documents (user_id, source_path)
  where source_path is not null;

create index client_documents_user_captured_idx
  on public.client_documents (user_id, captured_at desc);

create index client_documents_user_type_idx
  on public.client_documents (user_id, source_type, captured_at desc);

comment on table  public.client_documents is 'Raw long-form client artifacts (Fathom transcripts, weekly questionnaires, notes). Retrieved by similarity, never injected wholesale.';
comment on column public.client_documents.source_path is 'Path under clients/<slug>/ this row was ingested from. Upsert key for incremental re-ingest.';
comment on column public.client_documents.captured_at is 'When the artifact itself was created (Fathom call date, questionnaire submit), not when it was ingested.';

-- ---------------------------------------------------------------------------
-- client_document_chunks
-- ---------------------------------------------------------------------------
-- Dimension 1024 matches Voyage voyage-3 (Anthropic's recommended embeddings
-- provider). Pinned in code via EMBEDDING_DIMENSIONS so a future model
-- change requires an explicit migration rather than silently writing
-- wrong-dimension vectors.
create table public.client_document_chunks (
    id             uuid primary key default gen_random_uuid(),
    document_id    uuid not null references public.client_documents (id) on delete cascade,
    user_id        uuid not null references auth.users (id) on delete cascade,
    chunk_index    integer not null,
    chunk_text     text not null,
    embedding      vector(1024) not null,
    metadata       jsonb not null default '{}'::jsonb,
    created_at     timestamptz not null default now(),
    constraint client_document_chunks_text_not_blank check (length(btrim(chunk_text)) > 0),
    constraint client_document_chunks_index_nonneg   check (chunk_index >= 0)
);

create unique index client_document_chunks_doc_idx_unique
  on public.client_document_chunks (document_id, chunk_index);

create index client_document_chunks_user_doc_idx
  on public.client_document_chunks (user_id, document_id);

-- HNSW gives better recall than IVFFlat at our row counts and doesn't need
-- a population step before it becomes useful. Cosine distance matches the
-- normalization OpenAI returns. m / ef_construction defaults are tuned for
-- accuracy over insert speed; ingestion is offline anyway.
create index client_document_chunks_embedding_hnsw_idx
  on public.client_document_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

comment on table  public.client_document_chunks is 'Chunked + embedded slices of client_documents. Queried via match_client_chunks RPC.';
comment on column public.client_document_chunks.user_id is 'Denormalized from parent document so the HNSW index can be combined with a user_id filter cheaply.';

-- ---------------------------------------------------------------------------
-- updated_at trigger on client_documents
-- ---------------------------------------------------------------------------
create trigger client_documents_set_updated_at
  before update on public.client_documents
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client_documents       enable row level security;
alter table public.client_documents       force  row level security;
alter table public.client_document_chunks enable row level security;
alter table public.client_document_chunks force  row level security;

create policy client_documents_select_own
  on public.client_documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy client_document_chunks_select_own
  on public.client_document_chunks for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.client_documents       to authenticated;
grant select on public.client_document_chunks to authenticated;
grant all    on public.client_documents       to service_role;
grant all    on public.client_document_chunks to service_role;

-- ---------------------------------------------------------------------------
-- match_client_chunks RPC
--
-- Returns top-k chunks for a given user_id ordered by cosine similarity.
-- Joins document metadata (title, source_type, captured_at) so the caller
-- gets enough context to format a useful tool_result block without a
-- follow-up query.
--
-- security invoker — RLS on the underlying tables still applies, so a
-- mis-scoped caller can't read another user's chunks even if they pass
-- the wrong user_id. The user_id arg is the FILTER, RLS is the FENCE.
-- ---------------------------------------------------------------------------
create or replace function public.match_client_chunks(
  query_embedding vector(1024),
  match_user_id   uuid,
  match_count     integer default 6
)
returns table (
  chunk_id       uuid,
  document_id    uuid,
  chunk_index    integer,
  chunk_text     text,
  source_type    text,
  document_title text,
  captured_at    timestamptz,
  similarity     real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id                              as chunk_id,
    c.document_id                     as document_id,
    c.chunk_index                     as chunk_index,
    c.chunk_text                      as chunk_text,
    d.source_type                     as source_type,
    d.title                           as document_title,
    d.captured_at                     as captured_at,
    (1 - (c.embedding <=> query_embedding))::real as similarity
  from public.client_document_chunks c
  join public.client_documents       d on d.id = c.document_id
  where c.user_id = match_user_id
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 6), 50));
$$;

grant execute on function public.match_client_chunks(vector(1024), uuid, integer) to authenticated;
grant execute on function public.match_client_chunks(vector(1024), uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe the corpus.
--
-- Chunks are deleted first via FK cascade when the parent document is
-- removed, but the explicit DELETE on chunks is kept for clarity (and so a
-- future per-chunk maintenance task can't leave orphans).
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
