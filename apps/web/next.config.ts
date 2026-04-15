import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the workspace core package
  transpilePackages: ["@directoor/core"],

  // Turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},
};

export default nextConfig;
