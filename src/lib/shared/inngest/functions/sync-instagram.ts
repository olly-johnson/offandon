import { InstagramClient } from "@/engines/instagram/client";
import { runInstagramSync } from "@/engines/instagram/sync";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { inngest } from "../client";

const log = createLogger("inngest.sync-instagram");

/**
 * Nightly Instagram refresh. Iterates every active connection and runs
 * the same sync orchestrator that the manual-refresh action uses.
 *
 * Scheduled at 03:00 UTC. We use the service-role admin client because
 * Inngest jobs run with no end-user JWT; RLS doesn't apply.
 *
 * Sync errors per-user are caught and persisted on the connection's
 * last_sync_error column rather than thrown. The whole job only fails
 * if we can't enumerate connections at all.
 */
export const syncInstagram = inngest.createFunction(
  {
    id: "sync-instagram",
    name: "Instagram nightly refresh",
    retries: 2,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const supabase = createSupabaseAdminClient();

    const connections = await step.run("list-connections", async () => {
      const { data, error } = await supabase
        .from("instagram_connections")
        .select("user_id, access_token");
      if (error) throw new Error(`list-connections: ${error.message}`);
      return (data ?? []) as Array<{ user_id: string; access_token: string }>;
    });

    log.info("instagram nightly sync starting", {
      connection_count: connections.length,
    });

    let okCount = 0;
    let failCount = 0;
    for (const conn of connections) {
      const result = await step.run(`sync-${conn.user_id}`, async () => {
        const client = new InstagramClient();
        return runInstagramSync({
          supabase,
          client,
          userId: conn.user_id,
          accessToken: conn.access_token,
        });
      });
      if (result.ok) okCount += 1;
      else failCount += 1;
    }

    log.info("instagram nightly sync complete", {
      total: connections.length,
      ok: okCount,
      failed: failCount,
    });

    return { total: connections.length, ok: okCount, failed: failCount };
  },
);
