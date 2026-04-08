import type { NextConfig } from "next";
import path from "path";

// Build-time env validation — warn if critical env vars missing
const CRITICAL_ENV_VARS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "NEXT_PUBLIC_CHAIN_ID",
];

for (const envVar of CRITICAL_ENV_VARS) {
  if (!process.env[envVar]) {
    console.warn(
      `[cireta] WARNING: ${envVar} is not set. This may cause runtime errors.`
    );
  }
}

if (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID === "placeholder") {
  console.warn(
    "[cireta] WARNING: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set to 'placeholder' — wallet connection will not work."
  );
}

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Allow Safe app to embed this site in an iframe
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
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "src"),
      // MetaMask SDK pulls in React Native deps not needed in browser builds
      "@react-native-async-storage/async-storage": false,
      "react-native": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
