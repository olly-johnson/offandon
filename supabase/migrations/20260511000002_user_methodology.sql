-- Bot OS schema delta: user_methodology
--
-- Per-user methodology overlay (BO-036). Stacks on top of the house
-- methodology (docs/methodology/01-house.md + per-surface slices) and
-- the creator's Voice DNA. Examples a creator might write:
--   "Never use the word 'unlock'. I do not 'unlock' anything."
--   "When suggesting hooks for the Operator Frameworks pillar, prefer
--    specific dollar amounts. No vague 'predictable revenue' framing."
--   "Always prefer running metaphors over war metaphors."
--
-- One row per user (user_id is PRIMARY KEY) so the upsert path is
-- trivial and there's no version churn here. Voice DNA already handles
-- versioned identity drift; this surface is a simple living document.
--
-- The content column is plain text; the prompt builder renders it
-- verbatim wrapped in a marked block. We rely on the existing anti-slop
-- validator (run on engine outputs) to catch any sneaky em-dashes the
-- creator pastes in. We do NOT validate the overlay itself; trust the
-- creator to write what they want.

begin;

create table public.user_methodology (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    content    text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table  public.user_methodology is 'Per-user methodology overlay. One row per user; stacks on top of the house methodology in every surface prompt.';
comment on column public.user_methodology.content is 'Plain text. Rendered verbatim into the system prompt of chat, hook, IMF, and script engines.';

create trigger user_methodology_set_updated_at
  before update on public.user_methodology
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_methodology enable row level security;
alter table public.user_methodology force  row level security;

create policy user_methodology_select_own
  on public.user_methodology for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_methodology_insert_self
  on public.user_methodology for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_methodology_update_own
  on public.user_methodology for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy; creators clear by emptying the textarea (UPDATE).
-- Wipe path: delete_user_data.

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update on public.user_methodology to authenticated;
grant all on public.user_methodology to service_role;

-- ---------------------------------------------------------------------------
-- Extend delete_user_data to wipe the overlay
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

  delete from public.user_methodology where user_id = target_user_id;
  delete from public.user_memories    where user_id = target_user_id;
  delete from public.ideas            where user_id = target_user_id;
  delete from public.messages         where user_id = target_user_id;
  delete from public.conversations    where user_id = target_user_id;
  delete from public.scripts          where user_id = target_user_id;
  delete from public.script_batches   where user_id = target_user_id;
  delete from public.voice_dna        where user_id = target_user_id;
  delete from public.profiles         where id      = target_user_id;
  delete from auth.users              where id      = target_user_id;
end;
$$;

commit;
