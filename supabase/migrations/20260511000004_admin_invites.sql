-- Bot OS schema delta: admin invites (BO-013)
--
-- Replaces the dashboard-invite stub with a programmatic flow. The
-- admin clicks Invite in /admin/invite, the server action calls
-- supabase.auth.admin.inviteUserByEmail() with the service-role key,
-- and we record one row here per attempt for auditability + rate
-- limiting.
--
-- Admin gating is handled in the application layer via
-- `auth.users.raw_app_meta_data ->> 'is_admin' = 'true'`. RLS on this
-- table is intentionally locked down: NO `authenticated` role grants
-- at all. Every read and write goes through the service-role client
-- in the server action.
--
-- Promote the first admin (one-off, in the Supabase SQL editor):
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                              || '{"is_admin": true}'::jsonb
--    where email = 'you@example.com';

begin;

create table public.admin_invites (
    id           uuid primary key default gen_random_uuid(),
    invited_by   uuid not null references auth.users (id) on delete cascade,
    email        text not null,
    status       text not null default 'sent'
                 check (status in ('sent', 'accepted', 'revoked', 'failed')),
    error        text,
    created_at   timestamptz not null default now(),
    accepted_at  timestamptz,
    constraint admin_invites_email_not_blank
      check (length(btrim(email)) > 0)
);

create index admin_invites_invited_by_created_at_idx
  on public.admin_invites (invited_by, created_at desc);

create index admin_invites_email_idx
  on public.admin_invites (lower(email));

comment on table  public.admin_invites is 'One row per programmatic invite. Service-role-only access; not exposed to the authenticated role.';
comment on column public.admin_invites.invited_by is 'auth.users.id of the admin who issued the invite.';
comment on column public.admin_invites.status is 'sent | accepted | revoked | failed. We only count "sent" for rate-limiting so retry storms do not lock anyone out.';
comment on column public.admin_invites.error is 'Populated when status = failed; surface in the UI for diagnosis.';

alter table public.admin_invites enable row level security;
alter table public.admin_invites force  row level security;

-- No policies for authenticated. The only reader/writer is service_role
-- (which bypasses RLS) via the server action. RLS-enabled-with-no-policy
-- equals deny-by-default for every authenticated request.

grant all on public.admin_invites to service_role;

-- Extend the wipe: drop invites issued by the deleted user. Invites we
-- received (matched by email) are out of scope; the auth.users row is
-- the canonical record there.
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

  delete from public.admin_invites          where invited_by = target_user_id;
  delete from public.instagram_media        where user_id = target_user_id;
  delete from public.instagram_connections  where user_id = target_user_id;
  delete from public.user_methodology       where user_id = target_user_id;
  delete from public.user_memories          where user_id = target_user_id;
  delete from public.ideas                  where user_id = target_user_id;
  delete from public.messages               where user_id = target_user_id;
  delete from public.conversations          where user_id = target_user_id;
  delete from public.scripts                where user_id = target_user_id;
  delete from public.script_batches         where user_id = target_user_id;
  delete from public.voice_dna              where user_id = target_user_id;
  delete from public.profiles               where id      = target_user_id;
  delete from auth.users                    where id      = target_user_id;
end;
$$;

commit;
