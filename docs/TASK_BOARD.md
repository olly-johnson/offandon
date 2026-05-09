# Task Board - Bot OS MVP

Single source of truth for in-flight and completed work. Update when starting a task (status → In Progress) and when finishing (status → Done with PR ref). Stale board = workflow bug.

## Phase 0 — Foundations

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-001 | Infra: Next 16 + Onyx theme + Vitest workspace | claude | Done | PR #1 |
| BO-002 | Data: Supabase schema + RLS + GDPR delete | claude | Done | PR #1 |
| BO-003 | Engine: Voice DNA questionnaire logic (TDD) | claude | Done | PR #2 |
| BO-006 | Persistence: voice_dna table + replace_voice_dna RPC + typed clients | claude | Done | PR #3 |

## Phase 1 — Auth + Onboarding (in flight)

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-007 | Shared logger (`src/lib/shared/logger.ts`) | claude | In Progress | feature/auth-and-onboarding |
| BO-008 | Auth foundation: middleware, /signin, /auth/callback, /onboarding/set-password | claude | In Progress | feature/auth-and-onboarding |
| BO-009 | Onboarding wizard (3-step, multi-field) + profile creation | claude | In Progress | feature/auth-and-onboarding |
| BO-010 | Anthropic SDK wired behind ILLMClient (Claude 4.6 Sonnet, prompt caching) | claude | In Progress | feature/auth-and-onboarding |
| BO-011 | Dashboard stub (post-onboarding landing) | claude | In Progress | feature/auth-and-onboarding |
| BO-012 | Admin invite route stub (programmatic invite TODO) | claude | In Progress | feature/auth-and-onboarding |

## Phase 1 — Pending Claude 4.6 + content

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-004 | API: Claude 4.6 + anti-slop filter (anti-slop done; SDK wiring covered by BO-010) | claude | Partial | PR #2 (anti-slop) |
| BO-005 | Social: Instagram auth + last 30 videos | - | Todo | - |

## Conventions

- `Owner` is the agent name (e.g. `claude`) or a human name. Empty = unclaimed.
- `Status` ∈ {Todo, In Progress, Blocked, Done, Partial}.
- `Branch / PR` references the active branch while In Progress and the merged PR number once Done.
- Add a row before writing code; mark Done in the same PR that completes the task.
