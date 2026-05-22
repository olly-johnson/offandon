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
    ],
  },
};

export default nextConfig;
