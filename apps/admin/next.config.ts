import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes disabled: dynamic routes cause false TS errors
  // experimental: { typedRoutes: true },
};

export default nextConfig;
