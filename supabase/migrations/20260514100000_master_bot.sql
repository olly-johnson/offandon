-- Bot OS schema delta: Master Bot (BO-048)
--
-- Two-layer methodology editor for admins.
--
-- Layer 1: methodology_rules
--   Short one-liners ("never recommend pricing tactics"). Visible in the
--   admin UI as a list per slice. Soft-deleted so the Master Bot can
--   recall a previously-removed rule when the admin re-raises the topic.
--
-- Layer 2: house_methodology + house_methodology_versions
--   The big rule sheets, one row per slice. The .md files under
--   docs/methodology/ are the seed; once a row lands here the loader
--   prefers DB. Admins never see the raw text. Every save snapshots the
--   PRIOR content into _versions for revert + audit.
--
-- master_bot_messages: chat log for /admin/master-bot. Shared across
-- admins (no user_id scoping). One thread; no Voice DNA, no anti-slop.
--
-- All tables are service-role only at the RLS layer. The server action
-- gates by isAdmin() on the JWT.

begin;

-- ---------------------------------------------------------------------------
-- methodology_rules
-- ---------------------------------------------------------------------------
create table public.methodology_rules (
    id          uuid primary key default gen_random_uuid(),
    slice       text not null
                check (slice in ('house', 'chat', 'scripts', 'analyst')),
    rule        text not null check (length(btrim(rule)) > 0 and length(rule) <= 400),
    created_by  uuid references auth.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz
);

create index methodology_rules_slice_active_idx
  on public.methodology_rules (slice)
  where deleted_at is null;

comment on table  public.methodology_rules is 'Admin-authored one-liners. Append to each slice prompt at render time. Soft-deleted.';
comment on column public.methodology_rules.slice is 'house | chat | scripts | analyst. house applies to every engine.';

alter table public.methodology_rules enable row level security;
alter table public.methodology_rules force  row level security;
grant all on public.methodology_rules to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology
-- ---------------------------------------------------------------------------
create table public.house_methodology (
    slice       text primary key
                check (slice in ('house', 'chat', 'scripts', 'analyst')),
    content     text not null,
    updated_by  uuid references auth.users (id) on delete set null,
    updated_at  timestamptz not null default now()
);

comment on table public.house_methodology is 'DB-backed methodology slices. Admin-invisible; only the Master Bot reads / writes the raw text.';

alter table public.house_methodology enable row level security;
alter table public.house_methodology force  row level security;
grant all on public.house_methodology to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology_versions (append-only history)
-- ---------------------------------------------------------------------------
create table public.house_methodology_versions (
    id              uuid primary key default gen_random_uuid(),
    slice           text not null
                    check (slice in ('house', 'chat', 'scripts', 'analyst')),
    content         text not null,
    summary         text not null check (length(btrim(summary)) > 0),
    created_by      uuid references auth.users (id) on delete set null,
    created_at      timestamptz not null default now()
);

create index house_methodology_versions_slice_created_at_idx
  on public.house_methodology_versions (slice, created_at desc);

comment on table  public.house_methodology_versions is 'Append-only history. One row per house_methodology save; content here is the version BEFORE the change so revert is "copy this row back".';
comment on column public.house_methodology_versions.summary is 'Plain-English summary the Master Bot wrote when it proposed the edit. Shown on the history page.';

alter table public.house_methodology_versions enable row level security;
alter table public.house_methodology_versions force  row level security;
grant all on public.house_methodology_versions to service_role;

-- ---------------------------------------------------------------------------
-- house_methodology_proposals (pending edits awaiting admin Apply / Discard)
-- ---------------------------------------------------------------------------
create table public.house_methodology_proposals (
    id              uuid primary key default gen_random_uuid(),
    slice           text not null
                    check (slice in ('house', 'chat', 'scripts', 'analyst')),
    new_content     text not null,
    summary         text not null check (length(btrim(summary)) > 0),
    status          text not null default 'pending'
                    check (status in ('pending', 'applied', 'discarded')),
    proposed_by     uuid references auth.users (id) on delete set null,
    decided_by      uuid references auth.users (id) on delete set null,
    decided_at      timestamptz,
    created_at      timestamptz not null default now()
);

create index house_methodology_proposals_status_created_at_idx
  on public.house_methodology_proposals (status, created_at desc);

comment on table public.house_methodology_proposals is 'Staged house edits the Master Bot has proposed. The admin clicks Apply (-> house_methodology + _versions) or Discard.';

alter table public.house_methodology_proposals enable row level security;
alter table public.house_methodology_proposals force  row level security;
grant all on public.house_methodology_proposals to service_role;

-- ---------------------------------------------------------------------------
-- master_bot_messages (shared thread, not per-user)
-- ---------------------------------------------------------------------------
create table public.master_bot_messages (
    id           uuid primary key default gen_random_uuid(),
    author_id    uuid references auth.users (id) on delete set null,
    role         text not null check (role in ('user', 'assistant', 'system')),
    content      text not null,
    created_at   timestamptz not null default now()
);

create index master_bot_messages_created_at_idx
  on public.master_bot_messages (created_at asc);

comment on table public.master_bot_messages is 'Shared admin-only chat log for the Master Bot. Not scoped per user; every admin sees the same thread.';

alter table public.master_bot_messages enable row level security;
alter table public.master_bot_messages force  row level security;
grant all on public.master_bot_messages to service_role;

-- ---------------------------------------------------------------------------
-- delete_user_data: deleting an admin's auth row should NOT wipe the
-- methodology they wrote (operator-owned, shared resource). The FKs are
-- ON DELETE SET NULL so rows survive with a null `created_by` /
-- `updated_by` / `author_id`. Nothing to add to the wipe function.
-- ---------------------------------------------------------------------------

commit;
