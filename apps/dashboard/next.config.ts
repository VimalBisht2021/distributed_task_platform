import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: "../../",
  },
  transpilePackages: ["@local/builder"],
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
};

export default nextConfig;
