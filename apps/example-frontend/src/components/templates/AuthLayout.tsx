import { cn } from '@/lib/utils/cn';

export interface AuthLayoutProps {
  /** Page content (login form, etc.) */
  children: React.ReactNode;
  /** Page title */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Auth layout template.
 *
 * Centered layout for authentication pages (login, register, etc.).
 *
 * @example
 * <AuthLayout title="Sign In" description="Welcome back">
 *   <LoginForm />
 * </AuthLayout>
 */
export function AuthLayout({
  children,
  title,
  description,
  className,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-elevated)] p-4">
      <div
        className={cn(
          'w-full max-w-md',
          'bg-[var(--surface)] rounded-lg shadow-lg',
          'p-8',
          className
        )}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="inline-block font-bold text-2xl text-[var(--text-primary)]">
            Scaffold
          </a>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-[var(--text-secondary)]">
              {description}
            </p>
          )}
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
