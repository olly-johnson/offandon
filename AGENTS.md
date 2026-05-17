# Bot OS - Master Architecture (v1.3)

## 🏗 Modular "Engine" Architecture
- **Voice Engine (`src/engines/voice`):** Transforms raw questionnaire data into "Voice DNA." 
- **Social Engine (`src/engines/social`):** Instagram Graph API + Scraper logic. (Feeds the **Analyst Skill**).
- **Content Engine (`src/engines/content`):** Script generation + Humanization filtering. (Feeds the **Script Skill**).
- **Corpus Engine (`src/engines/corpus`):** Tier-2 client-information retrieval. Long-form artifacts (Fathom transcripts, weekly questionnaires, notes) are chunked + embedded into `client_documents` / `client_document_chunks`, then retrieved on demand. **Chat** calls it explicitly via the `search_client_corpus` tool. **Script Generator** calls it implicitly at gen start. Tier-1 (`voice_dna`, `user_methodology`, `user_memories`, `client_assets`) stays in the prompt; Tier-2 never goes in wholesale.
- **Fathom Engine (`src/engines/fathom`):** Webhook-driven ingestion of Fathom recordings. Verifies HMAC, normalises the structured transcript into speaker-attributed plaintext, resolves every attendee (`calendar_invitees` + `recorded_by`) against `auth.users.email` AND `public.fathom_email_aliases`, then chunks + Voyage-embeds synchronously through the Corpus Engine — one row per matched user, so a single call lands on the operator's `/transcripts` and on every client-with-a-site-account's `/transcripts`. Idempotent by `(user_id, source_path = fathom://<recording_id>)`. Companion CLIs `npm run backfill:fathom` (paginates `/external/v1/meetings` to seed historical recordings) and `npm run fathom:aliases` (CRUD for the alias table). Surface: `/transcripts` (list + detail).

## 🎯 Skill-to-Surface Mapping
1. **Chat Skill:** Consumes Voice DNA + Social Context. Surface: `/chat`.
2. **Analyst Skill:** Consumes Social Engine data. Surface: `/dashboard`.
3. **Script Writing Skill:** Consumes Voice DNA + Content Engine. Surface: `/scripts`.

## ✍️ The Humanization Manifesto (Anti-Slop Rules)
**Strictly Prohibited Patterns:**
- **Punctuation:** No em-dashes (—). 
- **Unicode/Emoji Noise:** Absolutely NO "✨", "🚀", "✅", "🔥", or "ready to dive in?". No curly quotes in code-generated scripts (use straight quotes).
- **Forbidden Buzzwords:** "Delve", "tapestry", "embark", "comprehensive", "nuances", "pivotal", "vibrant".
- **Structure:** No "Firstly/Secondly/Finally". No robotic summary conclusions.

## 🧪 Testing Strategy
- **Engine Tests:** Must validate that `Skill` outputs do not contain the prohibited patterns above.