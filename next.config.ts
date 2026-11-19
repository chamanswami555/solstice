import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server must not write its helper file for coding tools into the repository.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
