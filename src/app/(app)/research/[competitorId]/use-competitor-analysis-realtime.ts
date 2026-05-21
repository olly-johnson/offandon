"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/shared/supabase/browser";

/**
 * Subscribe to INSERT events on `competitor_media_analysis` for the
 * current user. Each tile on the drill-in grid renders an "Analyzing..."
 * spinner until an analysis row lands; the hook then triggers a page
 * refresh so the new row flows through as a prop and the spinner
 * clears naturally.
 *
 * Mirrors src/app/(app)/library/use-analysis-realtime.ts: same realtime
 * auth + RLS gotcha (must attach the access token to the WebSocket
 * before subscribing, otherwise events are filtered out by RLS).
 * INSERTs include the full row by default, so no REPLICA IDENTITY
 * FULL needed on this table.
 */
export function useCompetitorAnalysisRealtime(userId: string): void {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;

      channel = supabase
        .channel(`competitor-media-analysis-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "competitor_media_analysis",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, router]);
}
