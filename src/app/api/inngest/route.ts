import { serve } from "inngest/next";

import { inngest } from "@/lib/shared/inngest/client";
import { analyzeMedia } from "@/lib/shared/inngest/functions/analyze-media";
import { generateScripts } from "@/lib/shared/inngest/functions/generate-scripts";
import { ingestFathomRecordingFn } from "@/lib/shared/inngest/functions/ingest-fathom-recording";
import { refreshVoiceDna } from "@/lib/shared/inngest/functions/refresh-voice-dna";
import { syncInstagram } from "@/lib/shared/inngest/functions/sync-instagram";
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
    ingestFathomRecordingFn,
  ],
});
