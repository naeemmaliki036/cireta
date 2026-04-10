import type { Metadata } from "next";
import "@/styles/globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cireta | Tokenized Real-World Asset Investment",
  description:
    "Invest in tokenized gold and copper backed by physical reserves.",
  keywords: ["RWA", "tokenization", "gold", "copper", "commodities", "security tokens"],
  icons: {
    icon: "/favicon.ico",
    apple: "/images/logo/cireta-colored.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <AppProviders>{children}</AppProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
