"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/shared/supabase/browser";

/**
 * Subscribe to changes on `competitor_media` for the current user so
 * the preview-strip thumbnails on /research auto-update when the
 * analyzer flips analysis_pending / analysis_failed_reason or a new
 * scrape upserts fresh reels. competitor_media has REPLICA IDENTITY
 * FULL set in 20260521000002 so the user_id filter matches on UPDATE
 * events too (same fix as competitor_accounts).
 *
 * Auth: same gotcha as the other realtime hooks - attach the access
 * token via realtime.setAuth(...) before subscribing or RLS filters
 * every event out as the anon role.
 */
export function useCompetitorMediaRealtime(userId: string): void {
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
        .channel(`competitor-media-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "competitor_media",
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
