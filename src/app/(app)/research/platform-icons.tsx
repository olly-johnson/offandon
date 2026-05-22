/**
 * Inline SVG glyphs for the three platforms we surface in research.
 * lucide-react doesn't ship brand icons in our pinned version, so we
 * carry tiny hand-tuned paths instead. Each accepts the standard
 * SVG props so callers can size + position via className.
 */

import type { SVGProps } from "react";

import type { SuggestedPlatform } from "./suggested-creators";

export function InstagramGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M19.5 7.6c-1.6 0-3-.6-4-1.6V15a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3a2.7 2.7 0 1 0 1.8 2.6V3h3a4.6 4.6 0 0 0 4 4.6v3z" />
    </svg>
  );
}

export function YouTubeGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M22.6 7.2a2.8 2.8 0 0 0-2-2C18.8 4.8 12 4.8 12 4.8s-6.8 0-8.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.4 8.6.4 8.6.4s6.8 0 8.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.4-4.8zM9.8 15.4V8.6L15.6 12l-5.8 3.4z" />
    </svg>
  );
}

export function PlatformGlyph({
  platform,
  ...props
}: { platform: SuggestedPlatform } & SVGProps<SVGSVGElement>) {
  if (platform === "tiktok") return <TikTokGlyph {...props} />;
  if (platform === "youtube_shorts") return <YouTubeGlyph {...props} />;
  return <InstagramGlyph {...props} />;
}

export function platformBrandColor(platform: SuggestedPlatform): string {
  if (platform === "tiktok") return "#fe2c55";
  if (platform === "youtube_shorts") return "#ff0033";
  return "#e1306c";
}

export function platformLabel(platform: SuggestedPlatform): string {
  if (platform === "tiktok") return "TikTok";
  if (platform === "youtube_shorts") return "YouTube Shorts";
  return "Instagram";
}
