"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex justify-center items-center rounded-full outline-0 duration-300 cursor-pointer font-medium hover:opacity-80",
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-cta)] text-white",
        secondary: "bg-white text-text",
        outline: "border border-darkAqua text-darkAqua bg-transparent",
        outlineWhite: "border border-white text-white bg-transparent",
        gold: "bg-darkAqua text-white",
        dark: "bg-[var(--color-cta)] text-white",
        ghost: "bg-transparent text-darkAqua hover:bg-darkAqua/10",
      },
      size: {
        sm: "text-sm py-2 px-4",
        md: "text-sm py-2.5 md:py-3 px-6 md:px-8",
        lg: "text-sm lg:text-base py-2.5 md:py-[18px] px-6 md:px-10",
        icon: "p-3",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  }
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children">,
    VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading,
      children,
      disabled,
      leftIcon,
      rightIcon,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        type={type}
        className={cn(
          buttonVariants({ variant, size }),
          isLoading && "opacity-70 cursor-not-allowed",
          className
        )}
        ref={ref}
        disabled={disabled || isLoading}
        whileTap={{ scale: 0.97 }}
        {...props}
      >
        {isLoading ? (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : leftIcon ? (
          <span className="mr-2 flex items-center">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !isLoading ? (
          <span className="ml-2 flex items-center">{rightIcon}</span>
        ) : null}
      </motion.button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
