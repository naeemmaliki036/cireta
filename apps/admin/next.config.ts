import type { NextConfig } from "next";
import path from "path";

// Build-time env validation
if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    "[cireta-admin] WARNING: NEXT_PUBLIC_API_URL is not set. API proxy will default to http://localhost:8000."
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
  output: "standalone",
};

export default nextConfig;
