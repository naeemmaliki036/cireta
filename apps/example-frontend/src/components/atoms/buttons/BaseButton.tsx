import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Apply full width styling */
  fullWidth?: boolean;
}

/**
 * Base button atom - wraps native button element.
 *
 * Use this as the foundation for all button variations.
 * Molecules like `Button` compose this with additional features.
 */
export const BaseButton = forwardRef<HTMLButtonElement, BaseButtonProps>(
  ({ className, fullWidth, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // Base styles
        'inline-flex items-center justify-center gap-2',
        'rounded font-medium',
        'transition-colors duration-150',
        // Focus styles
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-[var(--brand-primary)]',
        // Disabled styles
        'disabled:pointer-events-none disabled:opacity-50',
        // Full width
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  )
);

BaseButton.displayName = 'BaseButton';
