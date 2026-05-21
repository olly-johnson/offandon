"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/shared/supabase/browser";

/**
 * Subscribe to changes on `competitor_accounts` for the current user.
 * The Inngest scrape worker writes back last_synced_at / last_sync_error
 * here, and this hook calls router.refresh() so the sync state badge
 * ("Syncing..." / "Last sync <date>" / "Sync failed") updates without
 * a manual reload.
 *
 * Mirrors src/app/(app)/library/use-analysis-realtime.ts: one channel
 * per /research mount, auto-unsubscribes on unmount. RLS on the table
 * (SELECT-own) gates events; the filter is belt-and-braces.
 */
export function useCompetitorRealtime(userId: string): void {
  const router = useRouter();

  // eslint-disable-next-line no-console
  console.log("[research-realtime] hook invoked", { userId });

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[research-realtime] effect run", { userId });
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`competitor-accounts-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "competitor_accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // eslint-disable-next-line no-console
          console.log("[research-realtime] event received", payload);
          router.refresh();
        },
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console
        console.log("[research-realtime] subscribe status", { status, err });
      });

    return () => {
      // eslint-disable-next-line no-console
      console.log("[research-realtime] cleanup");
      supabase.removeChannel(channel);
    };
  }, [userId, router]);
}
