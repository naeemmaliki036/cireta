"use client";

import { cn } from "@/lib/utils";
import {
  getEffectiveSaleStatus,
  type SaleStatusInput,
} from "@/lib/saleStatus";

interface SaleStatusBadgeProps extends SaleStatusInput {
  /**
   * Card variant: white pill with dot — for image-overlay placement on
   * cards where the underlying image varies. Use for the home page
   * card, projects listing card.
   */
  variant?: "card" | "pill";
  className?: string;
}

export function SaleStatusBadge({
  variant = "pill",
  className,
  ...input
}: SaleStatusBadgeProps) {
  const status = getEffectiveSaleStatus(input);

  if (variant === "card") {
    // Used over a hero image — keep the chip white-translucent so it's
    // legible against any background, and let the dot carry the colour.
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-black/70",
          className,
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", status.dotClass)} />
        {status.label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        status.pillClass,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", status.dotClass)} />
      {status.label}
    </span>
  );
}
