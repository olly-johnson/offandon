-- Bot OS schema delta: api_usage (BO-047)
--
-- Append-only audit of every Anthropic SDK round trip. One row per
-- response. Records who initiated it (user_id, nullable for system /
-- ingestion calls that have no creator context), which surface fired
-- it (chat | voice_dna | memory_extract | script | imf | hooks |
-- single_script | media_analysis | other), the model, and the four
-- token counts the SDK returns.
--
-- Cost is NOT stored. Pricing changes, models get re-priced, and we
-- want every page that surfaces $ to reflect the current rate sheet.
-- Compute it in TS at read time from the token columns + a small
-- model -> price map.
--
-- Service-role only. RLS is enabled with zero `authenticated` policies
-- so the table is invisible to any signed-in user; only the server
-- action / Inngest worker writes via the service-role client, and the
-- /admin page reads the same way.

begin;

create table public.api_usage (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid references auth.users (id) on delete set null,
    surface                  text not null
                             check (surface in (
                               'chat', 'voice_dna', 'memory_extract',
                               'script', 'imf', 'hooks', 'single_script',
                               'media_analysis', 'other'
                             )),
    model                    text not null,
    input_tokens             int  not null default 0 check (input_tokens >= 0),
    output_tokens            int  not null default 0 check (output_tokens >= 0),
    cache_creation_tokens    int  not null default 0 check (cache_creation_tokens >= 0),
    cache_read_tokens        int  not null default 0 check (cache_read_tokens >= 0),
    stop_reason              text,
    created_at               timestamptz not null default now()
);

create index api_usage_user_id_created_at_idx
  on public.api_usage (user_id, created_at desc);
create index api_usage_created_at_idx
  on public.api_usage (created_at desc);
create index api_usage_surface_idx
  on public.api_usage (surface);

comment on table  public.api_usage is 'Append-only token-usage audit. Service-role-only. Drives /admin spend metrics.';
comment on column public.api_usage.user_id is 'Creator the call was made on behalf of. NULL = system call (e.g. ingestion CLI).';
comment on column public.api_usage.surface is 'Which engine/feature fired the call. Constrained so /admin can group cleanly.';

alter table public.api_usage enable row level security;
alter table public.api_usage force  row level security;

-- No authenticated policies: deny-by-default for every signed-in user.
-- Service-role bypasses RLS.

grant all on public.api_usage to service_role;

-- Extend the wipe: user_id is ON DELETE SET NULL so the row sticks
-- around as anonymous spend history (useful for retroactive cost
-- forensics). delete_user_data() is the GDPR path though, so we do
-- nuke their rows explicitly there.
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
