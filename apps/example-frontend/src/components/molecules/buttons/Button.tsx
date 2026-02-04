'use client';

import { BaseButton, type BaseButtonProps } from '@/atoms/buttons/BaseButton';
import { Spinner } from '@/atoms/display/Spinner';
import { cn } from '@/lib/utils/cn';
import { buttonVariants } from '@/lib/utils/variants';

export interface ButtonProps extends BaseButtonProps {
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner and disable */
  isLoading?: boolean;
}

/**
 * Button molecule - composed BaseButton with variants and loading state.
 *
 * @example
 * <Button variant="primary" isLoading={isPending}>
 *   Submit
 * </Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner size="sm" className="mr-2" />
          <span className="opacity-70">{children}</span>
        </>
      ) : (
        children
      )}
    </BaseButton>
  );
}
