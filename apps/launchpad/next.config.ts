import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    domains: ["gateway.pinata.cloud", "ipfs.io"],
  },
};

export default nextConfig;
