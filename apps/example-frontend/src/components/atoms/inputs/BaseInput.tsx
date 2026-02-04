import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export interface BaseInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Show error styling */
  hasError?: boolean;
  /** Add padding for icon */
  hasIcon?: boolean;
}

/**
 * Base input atom - wraps native input element.
 *
 * Use this as the foundation for all input variations.
 * Molecules like `TextField` compose this with labels and error messages.
 */
export const BaseInput = forwardRef<HTMLInputElement, BaseInputProps>(
  ({ className, hasError, hasIcon, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // Base styles
        'w-full rounded border bg-[var(--surface)] px-3 py-2',
        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
        'transition-colors duration-150',
        // Border
        'border-[var(--border)]',
        // Focus styles
        'focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent',
        // Error styles
        hasError && 'border-[var(--error)] focus:ring-[var(--error)]',
        // Icon padding
        hasIcon && 'pl-10',
        // Disabled styles
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--surface-elevated)]',
        className
      )}
      {...props}
    />
  )
);

BaseInput.displayName = 'BaseInput';
