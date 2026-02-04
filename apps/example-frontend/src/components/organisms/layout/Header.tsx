'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/molecules/buttons/Button';
import { cn } from '@/lib/utils/cn';

export interface HeaderProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Header organism - main navigation header.
 *
 * Contains logo, navigation, theme toggle, and user menu.
 */
export function Header({ className }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header
      className={cn(
        'sticky top-0 z-50',
        'h-16 border-b border-[var(--border)]',
        'bg-[var(--surface)]/80 backdrop-blur-sm',
        className
      )}
    >
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="font-bold text-xl text-[var(--text-primary)]">
          Scaffold
        </a>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <a
            href="/dashboard"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Dashboard
          </a>
          <a
            href="/docs"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Docs
          </a>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded hover:bg-[var(--surface-elevated)] transition-colors"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <MoonIcon className="h-5 w-5" />
            ) : (
              <SunIcon className="h-5 w-5" />
            )}
          </button>

          {/* User menu */}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)]">
                {user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="sm">
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

// Simple icon components (replace with icon library in real app)
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}
