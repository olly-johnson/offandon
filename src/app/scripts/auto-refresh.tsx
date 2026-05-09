"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Polls the page once every `intervalMs` by calling router.refresh().
 * Drop into any server-component page where rows might change in the
 * background. The parent decides when to render this; mounting it = polling
 * is on, unmounting = off.
 */
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
