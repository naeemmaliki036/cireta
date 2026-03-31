"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Linkedin, Facebook, Instagram, Send, Youtube, Twitter } from "lucide-react";

const SOCIAL_LINKS = [
  { href: "https://x.com/cireta", icon: Twitter, label: "X" },
  { href: "https://linkedin.com/company/cireta", icon: Linkedin, label: "LinkedIn" },
  { href: "https://t.me/cireta", icon: Send, label: "Telegram" },
  { href: "https://instagram.com/cireta", icon: Instagram, label: "Instagram" },
  { href: "https://facebook.com/cireta", icon: Facebook, label: "Facebook" },
  { href: "https://youtube.com/@cireta", icon: Youtube, label: "YouTube" },
];

const LINK_COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Explore Projects", href: "/projects" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "How It Works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Cireta", href: "https://cireta.com", external: true },
      { label: "Contact Us", href: "/contact" },
      { label: "Partnerships", href: "mailto:issuers@cireta.com" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Terms of Service", href: "https://cireta.com/terms-of-service", external: true },
      { label: "Privacy Policy", href: "https://cireta.com/privacy-policy", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-inner mx-auto px-6 md:px-8">
        {/* Main footer grid */}
        <div className="py-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-12 gap-8 lg:gap-6">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-5 lg:pr-8">
            <Link href="/" className="inline-block mb-4">
              <Image src="/images/logo/cireta-logo.svg" alt="Cireta" width={552} height={146} className="h-7 w-auto" />
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed mb-5 max-w-sm">
              Regulated tokenization launchpad for real-world assets.
              Invest in commodity-backed security tokens with
              institutional-grade compliance and transparent on-chain ownership.
            </p>
            <div className="flex items-center gap-2">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-darkAqua hover:border-darkAqua transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns — evenly split remaining space */}
          {LINK_COLUMNS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-700 hover:text-text transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-sm text-gray-700 hover:text-text transition-colors">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact column */}
          <div className="lg:col-span-1 hidden lg:block" />
        </div>

        {/* Disclaimer */}
        <div className="border-t border-gray-100 py-5">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Cireta facilitates tokenized security offerings. Investments involve significant risk including potential loss of principal.
            Past performance is not indicative of future results. Securities are subject to applicable regulations and available only to verified investors.
            Cireta does not provide investment advice.
          </p>
        </div>

        {/* Copyright bar */}
        <div className="border-t border-gray-100 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Cireta. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs text-gray-500">
            <a href="https://cireta.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Terms</a>
            <a href="https://cireta.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Privacy</a>
            <Link href="/contact" className="hover:text-gray-900 transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
