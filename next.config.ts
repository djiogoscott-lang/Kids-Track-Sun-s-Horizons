import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No dev-mode build/compiling badge in the browser — this is a local
  // developer convenience, not something a monitor should ever see.
  devIndicators: false,
};

export default nextConfig;
