# Bot OS - Master Architecture (v1.3)

## 🏗 Modular "Engine" Architecture
- **Voice Engine (`src/engines/voice`):** Transforms raw questionnaire data into "Voice DNA." 
- **Social Engine (`src/engines/social`):** Instagram Graph API + Scraper logic. (Feeds the **Analyst Skill**).
- **Content Engine (`src/engines/content`):** Script generation + Humanization filtering. (Feeds the **Script Skill**).
- **Corpus Engine (`src/engines/corpus`):** Tier-2 client-information retrieval. Long-form artifacts (Fathom transcripts, weekly questionnaires, notes) are chunked + embedded into `client_documents` / `client_document_chunks`, then retrieved on demand. **Chat** calls it explicitly via the `search_client_corpus` tool. **Script Generator** calls it implicitly at gen start. Tier-1 (`voice_dna`, `user_methodology`, `user_memories`, `client_assets`) stays in the prompt; Tier-2 never goes in wholesale.

## 🎯 Skill-to-Surface Mapping
1. **Chat Skill:** Consumes Voice DNA + Social Context. Surface: `/chat`.
2. **Analyst Skill:** Consumes Social Engine data. Surface: `/dashboard`.
   - **Formula Matrix:** pure aggregation in `src/lib/shared/formula-matrix.ts`, fed by `src/app/(app)/dashboard/formula-matrix-data.ts`. Ranks format / topic / hook across the creator's own analysed library (`instagram_media_analysis`) plus tracked competitors (`competitor_media_analysis`), blending reach percentile with a per-channel trending-outlier ratio, then combines the winner of each dimension into one suggested video.
3. **Script Writing Skill:** Consumes Voice DNA + Content Engine. Surface: `/scripts`.

## ✍️ The Humanization Manifesto (Anti-Slop Rules)
**Strictly Prohibited Patterns:**
- **Punctuation:** No em-dashes (—). 
- **Unicode/Emoji Noise:** Absolutely NO "✨", "🚀", "✅", "🔥", or "ready to dive in?". No curly quotes in code-generated scripts (use straight quotes).
- **Forbidden Buzzwords:** "Delve", "tapestry", "embark", "comprehensive", "nuances", "pivotal", "vibrant".
- **Structure:** No "Firstly/Secondly/Finally". No robotic summary conclusions.

## 🧪 Testing Strategy
- **Engine Tests:** Must validate that `Skill` outputs do not contain the prohibited patterns above.