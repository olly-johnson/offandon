"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * Drop-in <Image> wrapper that falls through a YouTube thumbnail
 * resolution chain on 404s. YT exposes several variants per video
 * id, not all of which exist for every short:
 *
 *   oardefault.jpg  (1080x1920 vertical, the ideal Shorts thumb)
 *   maxresdefault.jpg (1280x720 landscape, exists for most uploads)
 *   hqdefault.jpg  (480x360 landscape, exists for every YT video)
 *   default.jpg    (120x90 last-resort)
 *
 * Older / re-uploaded shorts often miss oardefault. The wrapper
 * walks the chain on `onError` so the tile still paints something
 * recognisable even when the ideal URL 404s.
 *
 * Non-YouTube thumbnails (IG / TT / Supabase Storage) pass through
 * unchanged - no fallback path applies.
 */

const YT_HOST_MARKERS = ["ytimg.com", "ggpht.com"];

const YT_FALLBACKS: Array<[from: string, to: string]> = [
  ["/oardefault.jpg", "/maxresdefault.jpg"],
  ["/maxresdefault.jpg", "/hqdefault.jpg"],
  ["/hqdefault.jpg", "/default.jpg"],
];

function isYoutubeUrl(src: string): boolean {
  return YT_HOST_MARKERS.some((m) => src.includes(m));
}

function nextYoutubeFallback(src: string): string | null {
  for (const [from, to] of YT_FALLBACKS) {
    if (src.includes(from)) return src.replace(from, to);
  }
  return null;
}

export function ReelThumbnail(props: ImageProps) {
  // Destructure so we can rebuild the props with our fallback src
  // without TypeScript flagging duplicate keys from the spread.
  const { alt, src: _initialSrc, onError: _origOnError, ...rest } = props;
  void _initialSrc;
  void _origOnError;

  const initial = typeof props.src === "string" ? props.src : "";
  const [currentSrc, setCurrentSrc] = useState(initial);
  const [exhausted, setExhausted] = useState(false);

  function handleError() {
    if (!isYoutubeUrl(currentSrc)) {
      setExhausted(true);
      return;
    }
    const next = nextYoutubeFallback(currentSrc);
    if (next) {
      setCurrentSrc(next);
    } else {
      setExhausted(true);
    }
  }

  if (exhausted || !currentSrc) {
    // Nothing left to try - paint the bg colour through, no broken-
    // image icon flashing in the tile.
    return null;
  }

  return (
    <Image
      {...rest}
      alt={alt ?? ""}
      src={currentSrc}
      onError={handleError}
    />
  );
}
