"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            "input-field",
            error && "border-text/30 focus:border-text/40 focus:ring-text/10",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="input-error">{error}</p>}
        {helperText && !error && (
          <p className="text-black/50 text-xs mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
