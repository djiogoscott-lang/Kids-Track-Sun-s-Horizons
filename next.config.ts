import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No dev-mode build/compiling badge in the browser — this is a local
  // developer convenience, not something a monitor should ever see.
  devIndicators: false,
  experimental: {
    // Default-on since 16.3.0. Vercel preserves .next/cache between builds,
    // and this persistent build cache was found serving a stale compiled
    // chunk for a changed source file across three separate deployments —
    // same chunk hash, old code, despite the source genuinely differing
    // each time. Disabled until that cache-invalidation bug is understood.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
