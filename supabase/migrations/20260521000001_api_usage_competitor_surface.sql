-- Bot OS schema delta: api_usage adds 'competitor_analysis' surface (BO-063)
--
-- The Inngest analyze-competitor-media worker calls Anthropic via
-- AnthropicLLMClient with onUsage wired to buildUsageRecorder({
-- surface: "competitor_analysis" }). The existing CHECK constraint on
-- api_usage rejected that value, so the usage log inserts were
-- silently failing. Add the new surface and update the comment.

begin;

alter table public.api_usage
  drop constraint if exists api_usage_surface_check;

alter table public.api_usage
  add constraint api_usage_surface_check
  check (surface in (
    'chat', 'voice_dna', 'memory_extract',
    'script', 'imf', 'hooks', 'single_script',
    'media_analysis', 'competitor_analysis', 'other'
  ));

commit;
