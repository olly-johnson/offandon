import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Instagram CDN URLs (cdninstagram.com / fbcdn.net) ship a
    // Cross-Origin-Resource-Policy: same-origin header that blocks the
    // browser from rendering them on any other origin. Routing them
    // through Next's image optimizer (no `unoptimized` prop on <Image>)
    // makes the request server-side, where CORP doesn't apply, and
    // serves the bytes back from /_next/image as same-origin.
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      // Supabase Storage public bucket for suggested-creator avatars.
      { protocol: "https", hostname: "*.supabase.co" },
      // TikTok CDN domains. The actor returns covers via various
      // regional subdomains (p16-sign, p77-sign, etc.) so we allow
      // the broad family rather than enumerating each one.
      { protocol: "https", hostname: "*.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn-us.com" },
      { protocol: "https", hostname: "*.tiktokcdn-eu.com" },
      // YouTube thumbnail hosts. ytimg covers video thumbnails;
      // ggpht is used for channel + profile imagery.
      { protocol: "https", hostname: "*.ytimg.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
};

export default nextConfig;
