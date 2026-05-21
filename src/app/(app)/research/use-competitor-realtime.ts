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

  useEffect(() => {
    if (!userId) return;
    const supabase = createSupabaseBrowserClient();

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // The browser supabase client reads auth cookies for HTTP calls, but
    // the realtime WebSocket connects as the anon role unless we attach
    // the access token explicitly via realtime.setAuth(). Without that,
    // RLS filters every event out (auth.uid() is null vs the row's
    // user_id) and the channel reports SUBSCRIBED forever while nothing
    // arrives. Fetch the session, attach the JWT, then open the channel.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;

      channel = supabase
        .channel(`competitor-accounts-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "competitor_accounts",
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
