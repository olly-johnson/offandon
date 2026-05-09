# Task Board - Bot OS MVP

Single source of truth for in-flight and completed work. Update when starting a task (status → In Progress) and when finishing (status → Done with PR ref). Stale board = workflow bug.

## Phase 0. Foundations

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-001 | Infra: Next 16 + Onyx theme + Vitest workspace | claude | Done | PR #1 |
| BO-002 | Data: Supabase schema + RLS + GDPR delete | claude | Done | PR #1 |
| BO-003 | Engine: Voice DNA questionnaire logic (TDD) | claude | Done | PR #2 |
| BO-006 | Persistence: voice_dna table + replace_voice_dna RPC + typed clients | claude | Done | PR #3 |

## Phase 1. Auth + Onboarding

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-007 | Shared logger (`src/lib/shared/logger.ts`) | claude | Done | PR #4 |
| BO-008 | Auth foundation: middleware, /signin, /auth/callback, /auth/confirm, /onboarding/set-password | claude | Done | PR #4 |
| BO-009 | Onboarding wizard (3-step, multi-field) + profile creation | claude | Done | PR #4 |
| BO-010 | Anthropic SDK wired behind ILLMClient (Claude 4.6 Sonnet, prompt caching) | claude | Done | PR #4 |
| BO-011 | Dashboard stub (post-onboarding landing) | claude | Done | PR #4 |
| BO-012 | Admin invite route stub (programmatic invite TODO) | claude | Done | PR #4 |
| BO-004 | API: Claude 4.6 + anti-slop filter | claude | Done | PR #2 (anti-slop), PR #4 (SDK) |

## Phase 2. Content engine

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-017 | Migration: script_batches table + scripts.batch_id + delete_user_data update | claude | In Progress | feature/script-generator |
| BO-018 | Service-role Supabase admin client | claude | In Progress | feature/script-generator |
| BO-019 | Content engine: ScriptGenerator + system prompt + anti-slop | claude | In Progress | feature/script-generator |
| BO-020 | Content engine: persistence (createScriptBatch, saveGeneratedScripts, listBatches, getBatch, updateBatchStatus) | claude | In Progress | feature/script-generator |
| BO-021 | Inngest: client + generate-scripts function + /api/inngest serve route | claude | In Progress | feature/script-generator |
| BO-022 | /scripts UI: list page + detail page + GenerateButton + auto-refresh | claude | In Progress | feature/script-generator |
| BO-023 | Dashboard: link to /scripts + recent batch summary | claude | In Progress | feature/script-generator |

## Phase 1. Pending

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-005 | Social: Instagram auth + last 30 videos | - | Todo | - |

## Phase 1. Follow-ups discovered during smoke-testing

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-013 | Programmatic admin invite endpoint (replaces dashboard invite) | - | Todo | - |
| BO-014 | Custom email templates (invite, reset, magic link) with branded copy | - | Todo | - |
| BO-015 | Surface `error` query param on /signin (callback failures, expired links) | - | Todo | - |
| BO-016 | unwrapSupabaseError helper for the empty-error-on-401 wart | - | Todo | - |

## Conventions

- `Owner` is the agent name (e.g. `claude`) or a human name. Empty = unclaimed.
- `Status` is one of: Todo, In Progress, Blocked, Done, Partial.
- `Branch / PR` references the active branch while In Progress and the merged PR number once Done.
- Add a row before writing code; mark Done in the same PR that completes the task.
