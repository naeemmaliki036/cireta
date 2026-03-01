import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  images: {
    domains: ["gateway.pinata.cloud", "ipfs.io"],
  },
};

export default nextConfig;
