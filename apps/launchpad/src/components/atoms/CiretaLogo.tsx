"use client";

import { forwardRef, type SVGAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CiretaLogoProps extends SVGAttributes<SVGSVGElement> {
  variant?: "full" | "icon";
  color?: "white" | "dark" | "teal";
}

const CiretaLogo = forwardRef<SVGSVGElement, CiretaLogoProps>(
  ({ className, variant = "full", color = "dark", ...props }, ref) => {
    const colors = {
      white: "#FFFFFF",
      dark: "#0C0C0C",
      teal: "#13636F",
    };

    const fillColor = colors[color];

    if (variant === "icon") {
      return (
        <svg
          ref={ref}
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn("", className)}
          {...props}
        >
          <path
            d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
            fill={fillColor}
          />
        </svg>
      );
    }

    return (
      <svg
        ref={ref}
        width="130"
        height="34"
        viewBox="0 0 130 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("", className)}
        {...props}
      >
        {/* Star icon */}
        <path
          d="M17 1L18.75 14.25L32 17L18.75 19.75L17 33L15.25 19.75L2 17L15.25 14.25L17 1Z"
          fill={fillColor}
        />
        {/* Cireta text */}
        <text
          x="42"
          y="24"
          fill={fillColor}
          fontFamily="Gilroy, system-ui, sans-serif"
          fontWeight="700"
          fontSize="22"
          letterSpacing="-0.03em"
        >
          Cireta
        </text>
      </svg>
    );
  }
);

CiretaLogo.displayName = "CiretaLogo";

export { CiretaLogo };
