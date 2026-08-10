import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["@local/builder"],
  output: "standalone",
};

export default nextConfig;
