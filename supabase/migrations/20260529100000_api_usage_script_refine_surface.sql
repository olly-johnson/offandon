-- Bot OS schema delta: api_usage adds 'script_refine' surface (BO-076)
--
-- The Refine Studio's refineScriptChatAction calls Anthropic via
-- AnthropicLLMClient with onUsage wired to buildUsageRecorder({
-- surface: "script_refine" }). The existing CHECK constraint on
-- api_usage would reject that value, silently dropping the usage log
-- inserts. Add the new surface so /admin can group refine spend cleanly.

begin;

alter table public.api_usage
  drop constraint if exists api_usage_surface_check;

alter table public.api_usage
  add constraint api_usage_surface_check
  check (surface in (
    'chat', 'voice_dna', 'memory_extract',
    'script', 'imf', 'hooks', 'single_script', 'script_refine',
    'media_analysis', 'competitor_analysis', 'other'
  ));

commit;
