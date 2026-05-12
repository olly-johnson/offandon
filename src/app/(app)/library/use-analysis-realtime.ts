"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/shared/supabase/browser";

/**
 * Subscribe to insert/update events on `instagram_media_analysis` for
 * the current user. Whenever the Inngest analyze-media function
 * finishes and writes a row, the subscription fires and we call
 * router.refresh() to re-fetch server data. The /library page then
 * renders with the new analysis and the per-tile spinner clears
 * naturally (the analysis prop is no longer null).
 *
 * RLS on instagram_media_analysis (SELECT-own) gates which events the
 * browser actually receives; the filter clause below is belt-and-
 * braces so we don't even ask the server about other users' rows.
 *
 * One channel per `/library` mount. The channel auto-unsubscribes on
 * unmount, so navigating away cleans up.
 */
export function useAnalysisRealtime(userId: string): void {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`media-analysis-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instagram_media_analysis",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);
}
