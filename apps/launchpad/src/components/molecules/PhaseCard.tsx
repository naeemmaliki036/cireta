"use client";

import React from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, Lock } from "lucide-react";
import { cn, formatCurrency, formatDateTimeLocal } from "@/lib/utils";
import { Badge } from "@/components/atoms";

export interface PhaseCardProps {
  phaseNumber: number;
  name: string;
  pricePerToken: number;
  allocation: number;
  minContribution: number;
  maxContribution: number;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  isCompleted: boolean;
  soldAmount?: number;
  className?: string;
}

export function PhaseCard({
  phaseNumber,
  name,
  pricePerToken,
  allocation,
  minContribution,
  maxContribution,
  startTime,
  endTime,
  isActive,
  isCompleted,
  soldAmount = 0,
  className,
}: PhaseCardProps) {
  const progress = allocation > 0 ? (soldAmount / allocation) * 100 : 0;
  const now = new Date();
  const isUpcoming = startTime > now;

  const formatDate = (date: Date) => formatDateTimeLocal(date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={cn(
        "bg-box rounded-3xl p-6 border border-black/10 transition-all duration-300",
        isActive && "border-darkAqua shadow-tooltip",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-darkAqua text-white text-sm font-bold">
            {phaseNumber}
          </span>
          <h4 className="text-lg font-semibold text-text">{name}</h4>
        </div>
        {isCompleted ? (
          <Badge variant="success" size="sm">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        ) : isActive ? (
          <Badge variant="active" size="sm">
            <Clock className="h-3 w-3 mr-1" />
            Active
          </Badge>
        ) : isUpcoming ? (
          <Badge variant="pending" size="sm">
            <Lock className="h-3 w-3 mr-1" />
            Upcoming
          </Badge>
        ) : (
          <Badge variant="error" size="sm">
            Closed
          </Badge>
        )}
      </div>

      {/* Price */}
      <div className="mb-4">
        <p className="text-sm text-gray-500 mb-1">Price per Token</p>
        <p className="text-2xl font-bold text-darkAqua">
          {formatCurrency(pricePerToken)}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Progress</span>
          <span className="font-semibold">{progress.toFixed(1)}%</span>
        </div>
        <div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[8px]">
          <div
            className="h-[8px] bg-darkAqua rounded-[100px] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatCurrency(soldAmount)}</span>
          <span>{formatCurrency(allocation)}</span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Min Contribution</span>
          <span className="font-medium">{formatCurrency(minContribution)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Max. Allocation</span>
          <span className="font-medium">{formatCurrency(maxContribution)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Start Date</span>
          <span className="font-medium">{formatDate(startTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">End Date</span>
          <span className="font-medium">{formatDate(endTime)}</span>
        </div>
      </div>
    </motion.div>
  );
}
