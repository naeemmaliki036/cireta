"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      className,
      value,
      max = 100,
      showLabel = false,
      size = "md",
      animated = true,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const heights = {
      sm: "h-[8px]",
      md: "h-[12px]",
      lg: "h-[16px]",
    };

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        <div
          className={cn(
            "bg-[#b2b7b81a] rounded-[100px] overflow-hidden",
            heights[size]
          )}
        >
          {animated ? (
            <motion.div
              className={cn("bg-darkAqua rounded-[100px]", heights[size])}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          ) : (
            <div
              className={cn("bg-darkAqua rounded-[100px]", heights[size])}
              style={{ width: `${percentage}%` }}
            />
          )}
        </div>
        {showLabel && (
          <div className="flex justify-between mt-1 text-sm font-medium text-text">
            <span>{value.toLocaleString()}</span>
            <span>{max.toLocaleString()}</span>
          </div>
        )}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
