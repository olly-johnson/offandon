-- Backfill service_role GRANTs on Phase 0 / Phase 1 tables.
--
-- The Phase 0 init migration (20260509000000_init.sql) granted only
-- `authenticated` because the only Supabase clients in scope at that point
-- used the user JWT. Phase 2 introduced the Inngest worker, which runs
-- as `service_role` and therefore needs explicit table grants. Without
-- these the worker fails with 42501 permission denied even though
-- service_role bypasses RLS.
--
-- Idempotent: GRANT is a no-op when the privilege is already held.

begin;

grant all on public.profiles  to service_role;
grant all on public.scripts   to service_role;
grant all on public.voice_dna to service_role;

commit;
