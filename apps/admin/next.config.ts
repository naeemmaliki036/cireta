import type { NextConfig } from "next";
import path from "path";

// Build-time env validation
if (!process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("[cireta-admin] NEXT_PUBLIC_API_URL is required. Set it in .env.local");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  output: "standalone",
};

export default nextConfig;
