# Bot OS - Master Architecture (v1.3)

## 🏗 Modular "Engine" Architecture
- **Voice Engine (`src/engines/voice`):** Transforms raw questionnaire data into "Voice DNA." 
- **Social Engine (`src/engines/social`):** Instagram Graph API + Scraper logic. (Feeds the **Analyst Skill**).
- **Content Engine (`src/engines/content`):** Script generation + Humanization filtering. (Feeds the **Script Skill**).

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