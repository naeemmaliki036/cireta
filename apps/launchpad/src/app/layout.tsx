import type { Metadata } from "next";
import "@/styles/globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Cireta Launchpad | RWA Tokenization",
  description:
    "Invest in tokenized real-world assets including gold, copper, and commodity futures on Base L2.",
  keywords: ["RWA", "tokenization", "gold", "commodities", "Base", "ERC-3643"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
