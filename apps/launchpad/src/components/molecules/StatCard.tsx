"use client";

import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import CountUp from "react-countup";

export interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trend?: number;
  icon?: React.ReactNode;
  variant?: "default" | "dark" | "teal";
  className?: string;
  decimals?: number;
}

export function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  trend,
  icon,
  variant = "default",
  className,
  decimals = 0,
}: StatCardProps) {
  const variants = {
    default: "bg-box border-darkBlack/10",
    dark: "bg-darkBlack border-darkBlack text-white",
    teal: "bg-darkAqua border-darkAqua text-white",
  };

  const labelColors = {
    default: "text-gray-500",
    dark: "text-white/60",
    teal: "text-white/70",
  };

  const valueColors = {
    default: "text-text",
    dark: "text-white",
    teal: "text-white",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={cn(
        "rounded-3xl p-6 border",
        variants[variant],
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <p
          className={cn(
            "text-xs uppercase tracking-wide font-medium",
            labelColors[variant]
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "text-darkAqua",
              variant !== "default" && "text-white/80"
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <p
          className={cn(
            "text-2xl lg:text-3xl font-bold tracking-tight",
            valueColors[variant]
          )}
        >
          {prefix}
          <CountUp end={value} duration={2} decimals={decimals} separator="," />
          {suffix}
        </p>

        {trend !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              trend >= 0 ? "text-green-600" : "text-red-600"
            )}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
