-- Bot OS schema delta: script_batches + scripts.batch_id
--
-- Background-job model: a "batch" is the request to generate N scripts. The
-- Inngest worker progresses it through pending -> running -> complete | failed.
-- Individual `scripts` rows are created by the worker and linked back via
-- `batch_id`. Without a successful batch there are no scripts.
--
-- This migration is purely additive over 20260509000000_init.sql, so it can
-- be applied without touching any existing rows.

begin;

-- ---------------------------------------------------------------------------
-- script_batches
-- ---------------------------------------------------------------------------
create table public.script_batches (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid not null references auth.users (id) on delete cascade,
    status                text not null default 'pending'
                            check (status in ('pending', 'running', 'complete', 'failed')),
    voice_dna_snapshot    jsonb not null,
    count_requested       int not null default 7
                            check (count_requested between 1 and 30),
    count_generated       int not null default 0
                            check (count_generated >= 0),
    failure_reason        text,
    created_at            timestamptz not null default now(),
    completed_at          timestamptz
);

create index script_batches_user_id_created_at_idx
  on public.script_batches (user_id, created_at desc);

comment on table  public.script_batches is 'One row per "generate N scripts" request. Status tracks the Inngest job lifecycle.';
comment on column public.script_batches.voice_dna_snapshot is 'Frozen Voice DNA at request time. Reproducibility + drift audit.';
comment on column public.script_batches.failure_reason is 'Surfaced in /scripts when status = failed. Truncate to a human-readable message before storing.';

-- ---------------------------------------------------------------------------
-- scripts.batch_id (additive)
--
-- ON DELETE SET NULL: deleting a batch (only via delete_user_data) leaves
-- the script rows in place momentarily; delete_user_data immediately wipes
-- the script rows in the same transaction, so this never matters in
-- practice. The SET NULL is just a belt-and-braces choice over CASCADE so
-- a misbehaving direct DELETE on script_batches cannot inadvertently nuke
-- script content.
-- ---------------------------------------------------------------------------
alter table public.scripts
  add column batch_id uuid references public.script_batches (id) on delete set null;

create index scripts_batch_id_idx on public.scripts (batch_id);

comment on column public.scripts.batch_id is 'FK to the script_batches row that produced this script. Null = manually created.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.script_batches enable row level security;
alter table public.script_batches force  row level security;

create policy script_batches_select_own
  on public.script_batches for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy script_batches_insert_self
  on public.script_batches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy script_batches_update_own
  on public.script_batches for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy. Wipes go through delete_user_data().

-- ---------------------------------------------------------------------------
-- Explicit grants ("Automatically expose new tables" is OFF)
--
-- service_role bypasses RLS but NOT GRANTs. Without an explicit grant the
-- Inngest worker (which uses the service-role client) gets 42501 permission
-- denied before RLS even runs. We retroactively backfill the same grants
-- for the older tables in 20260509000002_service_role_grants.sql.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.script_batches to authenticated;
grant all                    on public.script_batches to service_role;

-- ---------------------------------------------------------------------------
-- Update delete_user_data to wipe script_batches
--
-- Order: delete child rows first (scripts), then their parent (script_batches),
-- then voice_dna, then profiles, then auth.users. The auth.users delete
-- cascades as a backstop, but explicit deletes here keep the wipe auditable.
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

  delete from public.scripts        where user_id = target_user_id;
  delete from public.script_batches where user_id = target_user_id;
  delete from public.voice_dna      where user_id = target_user_id;
  delete from public.profiles       where id      = target_user_id;
  delete from auth.users            where id      = target_user_id;
end;
$$;

commit;
