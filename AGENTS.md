# Bot OS - Master System Architecture (v1.1)

## 🏗 Modular "Engine" Architecture
To support parallel development, logic is siloed into Engines with strict TypeScript interfaces:
- `src/engines/voice`: RAG, Voice DNA profiling, Humanization filters.
- `src/engines/social`: Instagram Graph API, Scraper integration (Apify).
- `src/engines/content`: Script generation logic, Hook analysis.
- `src/lib/shared`: Core types, MSW handlers, and Supabase client.

## 🚀 2026 Tech Stack
- **Framework:** Next.js 15 (App Router).
- **LLM:** Claude 4.6 Sonnet (via Vercel AI SDK).
- **Database:** Supabase (Postgres + pgvector).
- **Transcription:** Deepgram Nova-2.
- **Queueing:** Inngest (Manual triggers for MVP, cron later).

## 🛡 Security & Compliance
- **RLS:** All tables MUST have `(role() = 'authenticated')` and `user_id = auth.uid()` policies.
- **GDPR:** `profiles` table includes a `data_policy_accepted` flag. A `delete_user_data` edge function is required to wipe vectors and transcripts.
- **Rate Limiting:** Upstash/Redis middleware on `/api/chat` and `/api/generate`.

## 🧪 Testing Strategy (High-Speed TDD)
- **Unit (Vitest):** Mock all external APIs. Focus on edge cases in the "Voice DNA" questionnaire.
- **Integration:** Use MSW to simulate Supabase responses.
- **E2E (Playwright):** Reserved for Auth and Dashboard "Happy Path" only.

## 🎨 Aesthetic: Onyx & Gold
- **Colors:** BG: `#000000`, Borders: `#1A1A1A`, Accents/Buttons: `#D4AF37`.
- **Typography:** Sleek, high-contrast sans-serif.