"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TagProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid" | "outline";
}

const Tag = forwardRef<HTMLDivElement, TagProps>(
  ({ className, variant = "glass", children, ...props }, ref) => {
    const variants = {
      glass:
        "flex items-center justify-center rounded-[100px] py-1.5 px-4 lg:py-2 lg:px-3.5 gap-[10px] border-[0.5px] border-white bg-white/20 text-white font-medium text-[14px] lg:text-[16px]/[16px] shadow-tag backdrop-blur-[10px]",
      solid:
        "flex items-center justify-center rounded-[100px] py-1 px-3 bg-darkAqua text-white font-medium text-[14px]",
      outline:
        "flex items-center justify-center rounded-[100px] py-1 px-3 border border-darkAqua/30 bg-darkAqua/10 text-darkAqua font-medium text-[12px] lg:text-[14px]",
    };

    return (
      <div ref={ref} className={cn(variants[variant], className)} {...props}>
        {children}
      </div>
    );
  }
);

Tag.displayName = "Tag";

export { Tag };
