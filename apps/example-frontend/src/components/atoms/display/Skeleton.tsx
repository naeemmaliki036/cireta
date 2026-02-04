import { cn } from '@/lib/utils/cn';

export interface SkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading placeholder atom.
 *
 * Use for content loading states to reduce layout shift.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--surface-elevated)]',
        className
      )}
    />
  );
}

// Pre-configured skeleton variants for common use cases
export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} />;
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-10 w-10 rounded-full', className)} />;
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-40 w-full" />
      <SkeletonText className="w-3/4" />
      <SkeletonText className="w-1/2" />
    </div>
  );
}
