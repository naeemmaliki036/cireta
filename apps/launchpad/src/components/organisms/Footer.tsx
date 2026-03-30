"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Linkedin, Facebook, Instagram, Send, Youtube, Twitter } from "lucide-react";

const SOCIAL_LINKS = [
  { href: "https://linkedin.com/company/cireta", icon: Linkedin, label: "LinkedIn" },
  { href: "https://facebook.com/cireta", icon: Facebook, label: "Facebook" },
  { href: "https://instagram.com/cireta", icon: Instagram, label: "Instagram" },
  { href: "https://t.me/cireta", icon: Send, label: "Telegram" },
  { href: "https://youtube.com/@cireta", icon: Youtube, label: "YouTube" },
  { href: "https://x.com/cireta", icon: Twitter, label: "X" },
];

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-inner mx-auto px-6 md:px-8">
        {/* Top section */}
        <div className="flex items-center justify-between py-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo/cireta-logo.svg" alt="Cireta" width={120} height={32} />
          </Link>
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-darkAqua hover:border-darkAqua transition-colors"
                aria-label={social.label}
              >
                <social.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-4 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} Cireta. All rights reserved.</p>
          <Link href="mailto:contact@cireta.com" className="hover:text-text transition-colors">Contact Us</Link>
          <div className="flex items-center gap-4">
            <a href="https://cireta.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-text transition-colors">Terms of Service</a>
            <span className="text-gray-200">|</span>
            <a href="https://cireta.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-text transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
