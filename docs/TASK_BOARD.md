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
| BO-017 | Migration: script_batches table + scripts.batch_id + delete_user_data update | claude | Done | PR #5 |
| BO-018 | Service-role Supabase admin client | claude | Done | PR #5 |
| BO-019 | Content engine: ScriptGenerator + system prompt + anti-slop | claude | Done | PR #5 |
| BO-020 | Content engine: persistence (createScriptBatch, saveGeneratedScripts, listBatches, getBatch, updateBatchStatus) | claude | Done | PR #5 |
| BO-021 | Inngest: client + generate-scripts function + /api/inngest serve route | claude | Done | PR #5 |
| BO-022 | /scripts UI: list page + detail page + GenerateButton + auto-refresh | claude | Done | PR #5 |
| BO-023 | Dashboard: link to /scripts + recent batch summary | claude | Done | PR #5 |
| BO-024 | service_role grant backfill on Phase 0 tables (migration 20260509000002) | claude | Done | PR #5 |
| BO-025 | Inngest catch-path: don't shadow original error if mark-failed itself fails | claude | Done | PR #5 |

## Phase 3. Chat surface

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-029 | Migration: conversations + messages + delete_user_data update + service_role grants | claude | Done | PR #6 |
| BO-030 | Chat engine: types + system-prompt + ChatEngine + IChatLLMClient + tests | claude | Done | PR #6 |
| BO-031 | Chat persistence: createConversation, listConversationsForUser, getConversationWithMessages, appendMessage | claude | Done | PR #6 |
| BO-032 | /chat list + /chat/[id] thread + send/start server actions + dashboard link | claude | Done | PR #6 |

## Phase 4. Personalization (planned)

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-034 | User Memory: post-chat Haiku extractor writes structured facts to `user_memories`. Injected into chat + scripts system prompts. Learns iteratively. | claude | Done | PR #21 |
| BO-035 | "Save that as an idea" — Chat `save_idea` tool-use, `ideas` table, Ideas Bank tab on /scripts, Pocket page. | claude | Done | PR #20 |
| BO-036 | Methodology layer: per-user evergreen principles editable on /methodology. Persisted in `user_methodology`. Injected into chat + scripts system prompts. | claude | Done | PR #22 |
| BO-037 | Methodology layer: load `docs/methodology/01-house.md` + per-surface slice into chat + scripts system prompts (analyst will follow when the engine exists). | claude | Done | PR #10 |
| BO-038 | Onboarding refresh: add ICP expansion (2am thoughts, internal battles, dreams), story bank seeds, contrarian belief, signature phrases, example creators. See `docs/methodology/05-onboarding-updates.md`. | claude | Done | PR #9 |
| BO-039 | Methodology validators: extend anti-slop with structural checks (SCCCC ≥ 3/5 on hooks, ≥ 3 Connection Points per script, word count gate). Wire into ScriptGenerator pre-submission gate. | - | Deferred | revisit if outputs degrade (short bodies, weak hooks, missing Connection Points across batches) |

## Phase 1. Pending

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-005 | Social: Instagram OAuth (Path A) + content library + follower/reach dashboard + nightly Inngest sync | claude | Done | PR #26 |

## Phase 1. Follow-ups discovered during smoke-testing

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-013 | Programmatic admin invite endpoint (replaces dashboard invite) + admin-only sidebar entry | claude | Done | PR #27 |
| BO-014 | Custom email templates (invite, reset, magic link) with branded copy | claude | Partial | PR #29 (invite done; reset + magic-link pending) |
| BO-015 | Surface `error` query param on /signin (callback failures, expired links) | - | Todo | - |
| BO-016 | unwrapSupabaseError helper for the empty-error-on-401 wart | - | Todo | - |
| BO-026 | Stuck-batch sweeper (cron: mark batches stuck > 5 min as failed) | - | Todo | - |
| BO-027 | "Cancel batch" button on /scripts to manually clear stuck rows | - | Todo | - |
| BO-028 | Document the "auto-expose new tables = OFF" Supabase setting in CLAUDE.md so future tables remember to grant service_role | - | Todo | - |
| BO-040 | Auth refresh-token race: detect `refresh_token_already_used` / `refresh_token_not_found` in middleware, clear dead Supabase auth cookies on the response, downgrade noisy log to debug. | claude | Done | PR #12 |
| BO-041 | Production deployment to Vercel + Supabase Site URL / Meta OAuth / Inngest cutover. Walkthrough in `docs/DEPLOY.md`. | claude | In Progress | infra/production-deploy (operator steps pending) |

## Conventions

- `Owner` is the agent name (e.g. `claude`) or a human name. Empty = unclaimed.
- `Status` is one of: Todo, In Progress, Blocked, Done, Partial.
- `Branch / PR` references the active branch while In Progress and the merged PR number once Done.
- Add a row before writing code; mark Done in the same PR that completes the task.
