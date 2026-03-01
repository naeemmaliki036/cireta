"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CiretaLogo } from "@/components/atoms";

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
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-darkBlack relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-darkAqua/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gold/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link href="/" className="flex items-center gap-3 mb-12">
              <CiretaLogo variant="icon" color="teal" className="w-12 h-12" />
              <span className="text-3xl font-bold text-white">Cireta</span>
            </Link>

            <h1 className="text-4xl xl:text-5xl font-semibold text-white leading-tight mb-6 -tracking-[1.8px]">
              Invest in the Future of{" "}
              <span className="text-darkAqua">Real World Assets</span>
            </h1>

            <p className="text-lg text-white/60 max-w-md">
              Fully regulated ERC-3643 security tokens for gold, copper, and
              commodity futures on Base L2.
            </p>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-12 space-y-4"
          >
            {[
              "KYC/AML compliant with ONCHAINID",
              "Institutional-grade security",
              "Transparent on-chain ownership",
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-darkAqua" />
                <span className="text-white/80">{feature}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Large Star Decoration */}
        <div className="absolute bottom-12 right-12 opacity-10">
          <svg
            width="200"
            height="200"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
              fill="#13636F"
            />
          </svg>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Link href="/" className="flex items-center gap-2">
              <CiretaLogo variant="icon" color="teal" className="w-10 h-10" />
              <span className="text-2xl font-bold text-text">Cireta</span>
            </Link>
          </div>

          {/* Title */}
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-text mb-2">{title}</h2>
            {subtitle && <p className="text-gray-500">{subtitle}</p>}
          </div>

          {/* Form Content */}
          {children}
        </motion.div>
      </div>
    </div>
  );
}
