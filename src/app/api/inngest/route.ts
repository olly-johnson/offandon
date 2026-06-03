import { serve } from "inngest/next";

import { inngest } from "@/lib/shared/inngest/client";
import { analyzeCompetitorMedia } from "@/lib/shared/inngest/functions/analyze-competitor-media";
import { analyzeMedia } from "@/lib/shared/inngest/functions/analyze-media";
import { downloadYoutubeMedia } from "@/lib/shared/inngest/functions/download-youtube-media";
import { generateScripts } from "@/lib/shared/inngest/functions/generate-scripts";
import { refreshSuggestedAvatars } from "@/lib/shared/inngest/functions/refresh-suggested-avatars";
import { refreshVoiceDna } from "@/lib/shared/inngest/functions/refresh-voice-dna";
import {
  competitorScrapeCompleted,
  competitorScrapeRequested,
  syncAllCompetitorsNightly,
} from "@/lib/shared/inngest/functions/scrape-competitor";
import { onboardingGenerate } from "@/lib/shared/inngest/functions/onboarding-generate";
import { syncInstagram } from "@/lib/shared/inngest/functions/sync-instagram";
// Weekly check-in send/reminder re-enabled (BO-078). GHL receives + processes
// submissions (/api/ghl/webhook), but its workflows don't do a recurring
// weekly send to all members, so the bot owns sending: these crons email
// every active member the GHL survey link (WEEKLY_CHECKIN_FORM_URL) each week.
import { weeklyCheckinReminder } from "@/lib/shared/inngest/functions/weekly-checkin-reminder";
import { weeklyCheckinSend } from "@/lib/shared/inngest/functions/weekly-checkin-send";

/**
 * Inngest serve endpoint. Inngest cloud (and the local dev CLI) hit this
 * URL to deliver events to our registered functions.
 *
 * Verification: Inngest signs requests with INNGEST_SIGNING_KEY. The
 * `serve()` helper validates the signature automatically when the env
 * var is set; in local dev with the Inngest CLI, signing is bypassed.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateScripts,
    syncInstagram,
    analyzeMedia,
    weeklyCheckinSend,
    weeklyCheckinReminder,
    refreshVoiceDna,
    onboardingGenerate,
    competitorScrapeRequested,
    competitorScrapeCompleted,
    syncAllCompetitorsNightly,
    analyzeCompetitorMedia,
    downloadYoutubeMedia,
    refreshSuggestedAvatars,
  ],
});
