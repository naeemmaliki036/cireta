import { cn } from '@/lib/utils/cn';

export interface SpinnerProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
};

/**
 * Loading spinner atom.
 *
 * A simple animated spinner for indicating loading states.
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-spin rounded-full',
        'border-[var(--border)] border-t-[var(--brand-primary)]',
        sizeClasses[size],
        className
      )}
    />
  );
}
