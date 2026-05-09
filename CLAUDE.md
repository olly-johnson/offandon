# Bot OS - Engineering Control Protocol

## 🛠 Operational Constraints
1. **Branching Strategy:** 
   - `infra/*`: Foundation, DB migrations, config.
   - `feature/*`: New Engines or UI modules.
   - `fix/*`: Bug resolution.
   - `refactor/*`: Performance or code quality improvements.
   - **Protocol:** NEVER commit to `main`. PRs must pass Vitest `engines` and `app` suites.
2. **TDD-First:** Logic implementation is forbidden until a corresponding `.test.ts` exists and fails. 
3. **Architecture Truth:** This file directs to `AGENTS.md`. No architectural changes permitted without updating `AGENTS.md` first.

## 🤖 Multi-Agent Routing
- **Lead/Infra Agent:** Handles `src/lib/shared`, `supabase/migrations`, and `inngest/`.
- **Engine Agents:** Work in isolated directories: `src/engines/voice`, `src/engines/social`, `src/engines/content`.
- **UI Agents:** Work in `src/app` and `src/components`, consuming the Engine interfaces.

## 📜 Update Log
- **2026-05-09:** Phase 0 Steps 1-2 complete. Next 16 pinned. RLS and GDPR wipe verified.