'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider } from '@/contexts/AuthContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * Application providers composition.
 *
 * Wraps the app with all required context providers in the correct order.
 * Order matters: outer providers are available to inner providers.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
