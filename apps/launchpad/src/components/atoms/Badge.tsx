"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[100px] font-medium text-[14px] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-darkAqua/10 text-darkAqua border border-darkAqua/30",
        active: "bg-darkAqua/10 text-darkAqua",
        pending: "bg-darkAqua/10 text-darkAqua",
        success: "bg-darkAqua/10 text-darkAqua",
        error: "bg-text/5 text-text border border-text/20",
        glass: "bg-white/20 text-white border-[0.5px] border-white shadow-tag backdrop-blur-[10px]",
        outline: "border border-black/20 text-text bg-transparent",
      },
      size: {
        sm: "py-0.5 px-2 text-xs",
        md: "py-1 px-3 text-[14px]",
        lg: "py-1.5 px-4 text-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
