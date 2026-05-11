-- Bot OS schema delta: ideas
--
-- "Ideas Bank": short, free-text ideas captured during chat (via the
-- save_idea tool the assistant can call) or saved manually from the UI.
-- An idea is the input to the Script Wizard; the wizard's step 1 can
-- pre-fill from a saved idea, turning the bank into a real funnel.
--
-- Source linkage:
--   source = 'chat'   -> captured via tool-use during a conversation.
--                        conversation_id and message_id point at the turn
--                        that triggered the capture.
--   source = 'manual' -> typed in by the user. Both FKs are NULL.
--
-- Both FKs are SET NULL on delete because we keep the idea even if the
-- originating chat is wiped (e.g. user clears chat history). The wipe path
-- in delete_user_data still drops ideas explicitly.

begin;

create table public.ideas (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    content          text not null,
    pillar           text,
    source           text not null check (source in ('chat', 'manual')),
    conversation_id  uuid references public.conversations (id) on delete set null,
    message_id       uuid references public.messages      (id) on delete set null,
    created_at       timestamptz not null default now(),
    constraint ideas_content_not_blank check (length(btrim(content)) > 0)
);

create index ideas_user_id_created_at_idx
  on public.ideas (user_id, created_at desc);

comment on table  public.ideas is 'One row per saved idea. Drains into the Script Wizard step 1.';
comment on column public.ideas.source is 'chat (via tool-use) | manual (typed in UI).';
comment on column public.ideas.pillar is 'Optional content pillar the assistant tagged. May not match any current pillar name.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ideas enable row level security;
alter table public.ideas force  row level security;

create policy ideas_select_own
  on public.ideas for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy ideas_insert_self
  on public.ideas for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy ideas_update_own
  on public.ideas for update
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy ideas_delete_own
  on public.ideas for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants ("Automatically expose new tables" is OFF)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.ideas to authenticated;
grant all on public.ideas to service_role;

-- ---------------------------------------------------------------------------
-- Update delete_user_data to wipe ideas
--
-- Order: ideas (FK to conversations/messages) -> messages -> conversations
-- -> rest. ideas FKs are SET NULL so a stale row would survive a conversation
-- delete, hence the explicit wipe here.
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

  delete from public.ideas          where user_id = target_user_id;
  delete from public.messages       where user_id = target_user_id;
  delete from public.conversations  where user_id = target_user_id;
  delete from public.scripts        where user_id = target_user_id;
  delete from public.script_batches where user_id = target_user_id;
  delete from public.voice_dna      where user_id = target_user_id;
  delete from public.profiles       where id      = target_user_id;
  delete from auth.users            where id      = target_user_id;
end;
$$;

commit;
