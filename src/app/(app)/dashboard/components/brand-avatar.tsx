"use client";

import Image from "next/image";
import { useState } from "react";

interface BrandAvatarProps {
  /** IG profile picture URL. May be null or an expired CDN link. */
  src: string | null;
  /** Single-letter fallback shown when there is no usable image. */
  initial: string;
}

/**
 * The gold-ringed brand avatar. Renders the Instagram profile picture when
 * we have one, and falls back to the initial letter if it is missing or
 * the (short-lived) CDN URL has expired by the time the browser loads it.
 */
export function BrandAvatar({ src, initial }: BrandAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        background: "var(--oo-gold-dim)",
        border: "2px solid var(--oo-gold)",
      }}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--oo-gold)",
            letterSpacing: "-0.02em",
          }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
