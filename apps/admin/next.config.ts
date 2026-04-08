import type { NextConfig } from "next";
import path from "path";

// Build-time env validation
if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn("[cireta-admin] WARNING: NEXT_PUBLIC_API_URL is not set. This may cause runtime errors.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://app.safe.global https://safe-client.safe.global",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET" },
        ],
      },
    ];
  },
};

export default nextConfig;
