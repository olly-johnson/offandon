import { serve } from "inngest/next";

import { inngest } from "@/lib/shared/inngest/client";
import { generateScripts } from "@/lib/shared/inngest/functions/generate-scripts";

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
  functions: [generateScripts],
});
