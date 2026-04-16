"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Linkedin, Instagram, Twitter } from "lucide-react";

const CIRETA = "https://www.cireta.com";

const socialLinks = [
  { id: "twitter", url: "https://x.com/ciretaofficial", Icon: Twitter, label: "Twitter" },
  { id: "linkedin", url: "https://www.linkedin.com/company/cireta/", Icon: Linkedin, label: "LinkedIn" },
  { id: "instagram", url: "https://www.instagram.com/cireta.official/", Icon: Instagram, label: "Instagram" },
];

const footerGroups = [
  {
    label: "Products",
    links: [
      { label: "Projects", href: "/projects", internal: true },
      { label: "RWA Tokenization", href: `${CIRETA}/tokenization` },
    ],
  },
  {
    label: "Company",
    links: [
      { label: "About Us", href: `${CIRETA}/about` },
      { label: "Team", href: `${CIRETA}/team` },
      { label: "Contact Us", href: `${CIRETA}/contact-us` },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Insights", href: `${CIRETA}/insights` },
      { label: "FAQs", href: `${CIRETA}/faqs` },
      { label: "Token Lifecycle", href: `${CIRETA}/cireta-token-lifecycle` },
      { label: "Guides & Glossary", href: `${CIRETA}/glossary` },
    ],
  },
  {
    label: "Legal",
    links: [
      { label: "Compliance", href: `${CIRETA}/compliance` },
      { label: "Risk Disclosure", href: `${CIRETA}/risk-disclosure` },
      { label: "Terms of Service", href: `${CIRETA}/terms-of-service` },
      { label: "Privacy Policy", href: `${CIRETA}/privacy-policy` },
      { label: "Editorial Policy", href: `${CIRETA}/editorial-policy` },
    ],
  },
];

export function Footer() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="relative z-[51] bg-white mt-auto">
      {/* Main footer content: Disclaimer left + Link columns right */}
      <motion.div
        className="border-t border-black/5 max-w-inner mx-auto px-4 md:px-8 py-12 md:py-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col lg:flex-row lg:justify-between gap-12 lg:gap-16">
          {/* Left: Disclaimer */}
          <div className="lg:max-w-[380px] flex-shrink-0">
            <p className="text-[11px] leading-[1.8] text-black/40">
              Website content is for general information only and does not constitute an offer, solicitation, recommendation or advice.
              Access and products may be restricted in certain jurisdictions and are subject to the{" "}
              <a href={`${CIRETA}/terms-of-service`} target="_blank" rel="noopener noreferrer" className="underline hover:text-darkAqua duration-200">Terms of Service</a>,{" "}
              <a href={`${CIRETA}/privacy-policy`} target="_blank" rel="noopener noreferrer" className="underline hover:text-darkAqua duration-200">Privacy Policy</a>{" "}
              and <a href={`${CIRETA}/risk-disclosure`} target="_blank" rel="noopener noreferrer" className="underline hover:text-darkAqua duration-200">Risk Disclosure</a>.
              Digital assets and tokenized products involve substantial risk, including loss of capital and limited liquidity. Any forward-looking statements are not guarantees.
            </p>
          </div>

          {/* Right: Link columns matching header nav */}
          <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-10">
            {footerGroups.map((group) => (
              <div key={group.label}>
                <h4 className="text-[13px] font-semibold text-black mb-4">{group.label}</h4>
                <ul className="space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {"internal" in link && link.internal ? (
                        <Link href={link.href} className="text-[13px] text-black/40 hover:text-darkAqua duration-200">
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-black/40 hover:text-darkAqua duration-200"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Giant centered brand logo */}
      <div className="w-full px-4 md:px-8 overflow-hidden">
        <motion.div
          className="select-none pointer-events-none max-w-inner mx-auto py-2"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <Image
            src="/images/logo/cireta_colored_trimmed.png"
            alt="Cireta"
            width={600}
            height={110}
            className="w-full max-h-[120px] md:max-h-[160px] object-contain mx-auto"
          />
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-black/5">
        <div className="max-w-inner mx-auto px-4 md:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[12px] text-black/40">
            &copy; Cireta, {year}. All rights reserved.
          </span>
          <div className="flex items-center gap-3">
            {socialLinks.map(({ id, url, Icon, label }) => (
              <a
                key={id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-box hover:bg-darkAqua/10 text-black/40 hover:text-darkAqua duration-200"
              >
                <Icon className="w-[14px] h-[14px]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
