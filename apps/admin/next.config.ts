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
  poweredByHeader: false,
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self' https://app.safe.global https://safe-client.safe.global",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
    ];
    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [
      { source: "/:path*", headers: securityHeaders },
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
