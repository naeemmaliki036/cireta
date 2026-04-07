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
};

export default nextConfig;
