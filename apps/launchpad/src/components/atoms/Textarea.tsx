"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, label, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="input-label">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            "input-field min-h-[120px] resize-y",
            error && "border-text/30 focus:border-text/40 focus:ring-text/10",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="input-error">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
