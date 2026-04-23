"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export interface SplitAuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function SplitAuthLayout({
  children,
  title,
  subtitle,
}: SplitAuthLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-darkAqua to-black relative overflow-hidden">
        {/* Subtle background shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-white/5 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/3 w-60 h-60 bg-darkAqua/20 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10 flex flex-col justify-between h-full px-14 xl:px-20 py-12">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo/cireta-logo-white.svg" alt="Cireta" width={552} height={146} className="h-8 w-auto" />
          </Link>

          <div>
            <h1 className="text-3xl xl:text-4xl font-semibold text-white leading-tight mb-5 -tracking-[1px]">
              Own a Part of{" "}
              <span className="text-white/70">Real-World Assets</span>
            </h1>

            <p className="text-base text-white/50 leading-relaxed">
              Explore opportunities backed by tangible assets, designed to be simple and transparent.
            </p>

            <div className="mt-8 space-y-3">
              {[
                "Regulated RWA project tokens",
                "Institutional-grade compliance",
                "Transparent on-chain ownership & redemption",
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="text-sm text-white/60">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Cireta. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="relative flex-1 flex items-center justify-center p-8 bg-white">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={140} height={38} className="h-9 w-auto" />
            </Link>
          </div>

          {/* Title */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-text mb-1">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
          </div>

          {/* Form Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
