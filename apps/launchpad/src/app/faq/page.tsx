"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    category: "Getting Started",
    items: [
      {
        q: "What is Cireta?",
        a: "Cireta is a regulated tokenization launchpad for real-world assets (RWA). We enable investors to participate in commodity-backed security tokens — including gold, copper, and futures.",
      },
      {
        q: "How do I create an account?",
        a: "Click 'Register' and enter your email. We use passwordless authentication — you'll receive a one-time verification code via email. No passwords to remember.",
      },
      {
        q: "What is KYC and why is it required?",
        a: "KYC (Know Your Customer) is a regulatory requirement for security token investments. It verifies your identity to comply with anti-money laundering laws. The process takes 2-5 minutes via our partner Sumsub.",
      },
      {
        q: "What's the difference between Individual and Corporate accounts?",
        a: "Individual accounts require personal KYC (ID + selfie). Corporate accounts require KYB (Know Your Business) with company documentation and beneficial ownership details. This choice is permanent and determines your compliance path.",
      },
    ],
  },
  {
    category: "Investing",
    items: [
      {
        q: "What types of assets can I invest in?",
        a: "Cireta lists tokenized commodity-backed assets including gold reserves, copper cathode, and commodity futures. Each project is vetted and backed by verified issuers.",
      },
      {
        q: "How do I invest?",
        a: "After completing KYC verification, browse available projects and click 'Invest'. You can pay on-chain with crypto (USDC on Base) or via OTC/bank transfer for larger allocations.",
      },
      {
        q: "What is the minimum investment?",
        a: "Minimum investment varies by project and sale phase. Each project page displays the minimum and maximum contribution amounts for the current phase.",
      },
      {
        q: "What blockchain are the tokens on?",
        a: "All Cireta tokens are ERC-3643 security tokens deployed on an EVM-compatible chain. This ensures low gas fees and fast transactions.",
      },
    ],
  },
  {
    category: "Wallets & Security",
    items: [
      {
        q: "Which wallets are supported?",
        a: "We support EVM-compatible wallets including MetaMask, Coinbase Wallet, WalletConnect, Rainbow, and Rabby. Safe (multisig) wallets are also supported.",
      },
      {
        q: "Do I need a wallet to invest?",
        a: "A wallet is required for on-chain investments. However, you can also invest via OTC/bank transfer without connecting a wallet. You can add a wallet later from your account settings.",
      },
      {
        q: "Why do I need to sign a message when connecting my wallet?",
        a: "Signature verification proves you own the wallet address. This links your wallet to your Cireta account securely. The signature is stored so you won't be asked again for the same wallet.",
      },
      {
        q: "How many wallets can I connect?",
        a: "You can connect up to 10 wallets per account. Each wallet is verified via signature and screened for compliance.",
      },
    ],
  },
  {
    category: "Compliance & Legal",
    items: [
      {
        q: "Are Cireta tokens securities?",
        a: "Yes. Cireta tokens are ERC-3643 compliant security tokens. They include on-chain identity verification and transfer restrictions to comply with securities regulations.",
      },
      {
        q: "Which countries are restricted?",
        a: "Certain jurisdictions may be restricted based on local securities laws. During KYC, your country of residence is verified. Contact support@cireta.com for specific country eligibility.",
      },
      {
        q: "How is my data protected?",
        a: "All personally identifiable information (PII) is encrypted at rest. Wallet addresses are checksummed and encrypted. We follow OWASP security best practices and conduct regular security audits.",
      },
    ],
  },
];

export default function FAQPage() {
  const [openItem, setOpenItem] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar variant="light" />

      <main className="flex-1 pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-text tracking-tight mb-4">Frequently Asked Questions</h1>
            <p className="text-gray-500 max-w-xl mx-auto">
              Everything you need to know about investing in tokenized real-world assets on Cireta.
            </p>
          </div>

          <div className="space-y-10">
            {FAQS.map((section) => (
              <div key={section.category}>
                <h2 className="text-lg font-semibold text-text mb-4">{section.category}</h2>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const key = `${section.category}-${item.q}`;
                    const isOpen = openItem === key;
                    return (
                      <div key={key} className="border border-gray-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setOpenItem(isOpen ? null : key)}
                          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <span className="font-medium text-sm text-text pr-4">{item.q}</span>
                          <ChevronDown className={cn("h-4 w-4 text-gray-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                            {item.a}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center bg-gray-50 rounded-2xl p-8">
            <h3 className="font-semibold text-text mb-2">Still have questions?</h3>
            <p className="text-sm text-gray-500 mb-4">Our team is here to help.</p>
            <a href="mailto:support@cireta.com" className="inline-flex items-center gap-2 btn-cta text-sm px-6 py-2.5 rounded-full transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
