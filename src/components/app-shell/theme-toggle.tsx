"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

/**
 * Subscribe + snapshot for useSyncExternalStore. We observe the
 * `class` attribute on <html> via MutationObserver so any direct
 * classList mutation (including the click handler below) is picked
 * up without manual coupling.
 */
function subscribeToHtmlClass(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => obs.disconnect();
}
function getClientTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function getServerTheme(): null {
  return null;
}

/**
 * Light/dark toggle button. Reads the current theme from the <html>
 * class so it stays in sync with whatever the no-flash script in
 * `app/layout.tsx` resolved at first paint. Subsequent flips persist
 * to localStorage under "theme".
 *
 * Renders a placeholder span on the SSR pass and on the initial
 * hydration tick (when server theme is null), so the row layout
 * doesn't shift once we have the real DOM read.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(
    subscribeToHtmlClass,
    getClientTheme,
    getServerTheme,
  );

  const onClick = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    if (next === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* Storage can throw in private browsing; ignore. */
    }
  }, []);

  if (theme === null) {
    return <span aria-hidden className="size-7" />;
  }

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={onClick}
      className="oo-icon-btn"
    >
      {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
    </button>
  );
}
