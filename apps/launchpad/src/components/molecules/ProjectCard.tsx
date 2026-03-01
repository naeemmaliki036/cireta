"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, Users } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export interface ProjectCardProps {
  id: string;
  title: string;
  slug: string;
  imageUrl: string;
  assetType: string;
  fundingRound?: string;
  currentRaised: number;
  targetAmount: number;
  investorCount?: number;
  className?: string;
  index?: number;
}

export function ProjectCard({
  title,
  slug,
  imageUrl,
  assetType,
  fundingRound,
  currentRaised,
  targetAmount,
  investorCount,
  className,
  index = 0,
}: ProjectCardProps) {
  const progress =
    targetAmount > 0
      ? Math.min((currentRaised / targetAmount) * 100, 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        type: "spring",
        duration: 0.8,
        delay: index * 0.1,
      }}
    >
      <Link
        href={`/project/${slug}`}
        className={cn(
          "relative group block bg-box p-1 rounded-3xl border-[1.5px] border-darkBlack/10 h-full cursor-pointer overflow-hidden transition-shadow duration-300 hover:shadow-tooltip",
          className
        )}
        aria-label={title}
      >
        {/* Glass Tag - Asset Type */}
        <div className="inline-flex items-center justify-center absolute left-4 top-4 lg:top-6 lg:left-6 z-[1]">
          <div className="flex items-center justify-center rounded-[100px] py-1.5 px-4 lg:py-2 lg:px-3.5 gap-[10px] border-[0.5px] border-white bg-white/20 text-white font-medium text-[14px] lg:text-[16px]/[16px] shadow-tag backdrop-blur-[10px]">
            {assetType}
          </div>
        </div>

        <div className="relative">
          {/* Image Area */}
          <div className="rounded-[20px] h-[300px] md:h-[393px] overflow-hidden">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={title}
                width={520}
                height={393}
                className="w-full h-full object-cover object-center group-hover:scale-105 duration-500"
                loading="lazy"
              />
            ) : (
              <div className="bg-darkAqua w-full h-full flex items-center justify-center">
                <svg
                  width="70"
                  height="68"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
                    fill="white"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Card Body */}
          <div className="flex justify-between flex-col pt-4 p-3">
            {/* Title Row */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <h3 className="text-[16px] lg:text-[18px]/[21.19px] font-medium text-text">
                {title}
              </h3>
            </div>

            {/* Funding Round Badge */}
            {fundingRound && (
              <div className="mb-6">
                <span className="inline-flex items-center justify-center rounded-[100px] py-1 px-3 border border-darkAqua/30 bg-darkAqua/10 text-darkAqua font-medium text-[12px] lg:text-[14px] capitalize">
                  {fundingRound} Round
                </span>
              </div>
            )}
            {!fundingRound && <div className="mb-6" />}

            {/* Progress Bar */}
            <div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[12px]">
              <div
                className="h-[12px] bg-darkAqua rounded-[100px] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-[12px] mt-1.5 lg:mt-2.5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center text-darkAqua h-[13px] w-[20px]">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-[14px] lg:text-[16px]/5">
                    Raised
                  </span>
                  <span className="text-[14px] lg:text-[16px]/[19.09px] font-semibold">
                    {formatCurrency(currentRaised)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[14px] lg:text-[16px]/5">
                    Target
                  </span>
                  <span className="text-[14px] lg:text-[16px]/[19.09px] font-semibold">
                    {formatCurrency(targetAmount)}
                  </span>
                </div>
              </div>
              {investorCount !== undefined && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-darkAqua" />
                  <span className="text-[14px] lg:text-[16px]/5 font-semibold">
                    {investorCount}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
