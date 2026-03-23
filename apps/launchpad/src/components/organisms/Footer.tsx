"use client";

import React from "react";
import Link from "next/link";
import { CiretaLogo } from "@/components/atoms";
import { Twitter, Github, MessageCircle } from "lucide-react";

type FooterLink = { href: string; label: string; external?: boolean };

const FOOTER_LINKS: Record<string, FooterLink[]> = {
  Platform: [
    { href: "/explore", label: "Explore Projects" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/account", label: "Account" },
  ],
  Resources: [
    { href: "https://docs.cireta.com", label: "Documentation", external: true },
    { href: "https://cireta.com/faqs", label: "FAQs", external: true },
    { href: "https://cireta.com/insights", label: "Insights", external: true },
  ],
  Legal: [
    { href: "https://cireta.com/terms-of-service", label: "Terms of Service", external: true },
    { href: "https://cireta.com/privacy-policy", label: "Privacy Policy", external: true },
  ],
};

const SOCIAL_LINKS = [
  { href: "https://twitter.com/cireta", icon: Twitter, label: "Twitter" },
  { href: "https://github.com/cireta", icon: Github, label: "GitHub" },
  { href: "https://discord.gg/cireta", icon: MessageCircle, label: "Discord" },
];

export function Footer() {
  return (
    <footer className="bg-darkBlack text-white">
      <div className="max-w-inner mx-auto px-4 md:px-8 py-16">
        {/* Main Footer */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <CiretaLogo variant="icon" color="teal" className="w-10 h-10" />
              <span className="text-2xl font-bold">Cireta</span>
            </Link>
            <p className="text-white/60 text-sm max-w-sm mb-6">
              The regulated RWA tokenization launchpad for gold, copper, and commodity
              futures. Fully compliant ERC-3643 security tokens on Base L2.
            </p>
            <div className="flex gap-4">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-darkAqua/20 transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold uppercase tracking-wide mb-4">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/60 hover:text-white transition-colors text-sm"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-white/60 hover:text-white transition-colors text-sm"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} Cireta. All rights reserved.
          </p>
          <p className="text-white/40 text-sm">
            Built on{" "}
            <a
              href="https://base.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-darkAqua hover:text-white transition-colors"
            >
              Base
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
