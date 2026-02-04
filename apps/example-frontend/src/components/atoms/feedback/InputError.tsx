import { cn } from '@/lib/utils/cn';

export interface InputErrorProps {
  /** Error message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Input error message atom.
 *
 * Displays validation error messages below form inputs.
 */
export function InputError({ message, className }: InputErrorProps) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={cn(
        'text-sm text-[var(--error)] mt-1',
        className
      )}
    >
      {message}
    </p>
  );
}
