'use client';

import { forwardRef, useId } from 'react';

import { BaseInput, type BaseInputProps } from '@/atoms/inputs/BaseInput';
import { InputError } from '@/atoms/feedback/InputError';
import { cn } from '@/lib/utils/cn';

export interface TextFieldProps extends BaseInputProps {
  /** Input label */
  label: string;
  /** Error message */
  error?: string;
  /** Helper text below input */
  helperText?: string;
  /** Make label visually hidden but accessible */
  hideLabel?: boolean;
}

/**
 * Text field molecule - composed input with label and error handling.
 *
 * @example
 * <TextField
 *   label="Email"
 *   type="email"
 *   error={errors.email?.message}
 *   {...register('email')}
 * />
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    { label, error, helperText, hideLabel, className, id, ...props },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={cn('space-y-1', className)}>
        <label
          htmlFor={inputId}
          className={cn(
            'block text-sm font-medium text-[var(--text-primary)]',
            hideLabel && 'sr-only'
          )}
        >
          {label}
          {props.required && (
            <span className="text-[var(--error)] ml-1">*</span>
          )}
        </label>

        <BaseInput
          ref={ref}
          id={inputId}
          hasError={!!error}
          aria-invalid={!!error}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          {...props}
        />

        {error ? (
          <InputError id={errorId} message={error} />
        ) : helperText ? (
          <p
            id={helperId}
            className="text-sm text-[var(--text-muted)]"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

TextField.displayName = 'TextField';
