'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { User, LoginCredentials, AuthTokens } from '@/lib/types';
import { ApiError } from '@/lib/api/errors';
import { getLogger } from '@/lib/utils/logger';

const logger = getLogger('AuthContext');

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Token refresh interval (25 minutes - before typical 30min expiry)
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider.
 *
 * Manages user authentication state, token storage, and auth operations.
 * Supports both localStorage (default) and httpOnly cookie modes.
 *
 * Features:
 * - Automatic token refresh in background
 * - Race condition prevention
 * - Proper error handling
 *
 * @example
 * // In root layout
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 *
 * // In components
 * const { user, login, logout, isAuthenticated } = useAuth();
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs to prevent race conditions
  const isRefreshing = useRef(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Clear all auth tokens from storage.
   */
  const clearTokens = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  /**
   * Fetch current user from API.
   */
  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/example-api/api/v1/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include', // Include cookies if using httpOnly mode
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        logger.debug('User fetched successfully');
      } else if (response.status === 401) {
        // Token expired, try to refresh
        logger.debug('Token expired, attempting refresh');
        clearTokens();
        setUser(null);
      } else {
        const error = await ApiError.fromResponse(response);
        logger.warn('Failed to fetch user', { error: error.toJSON() });
        clearTokens();
        setUser(null);
      }
    } catch (err) {
      logger.error('Network error fetching user', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      // Keep user state on network errors (might be offline)
    } finally {
      setIsLoading(false);
    }
  }, [clearTokens]);

  /**
   * Refresh access token (with race condition prevention).
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    // If already refreshing, wait for existing promise
    if (isRefreshing.current && refreshPromise.current) {
      return refreshPromise.current;
    }

    const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refresh) {
      throw new ApiError(401, 'No refresh token', 'NO_REFRESH_TOKEN');
    }

    isRefreshing.current = true;

    const doRefresh = async () => {
      try {
        const response = await fetch('/api/example-api/api/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ refreshToken: refresh }),
        });

        if (!response.ok) {
          const error = await ApiError.fromResponse(response);
          logger.warn('Token refresh failed', { status: response.status });
          clearTokens();
          setUser(null);
          throw error;
        }

        const tokens: AuthTokens = await response.json();

        localStorage.setItem(TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

        logger.debug('Token refreshed successfully');
      } finally {
        isRefreshing.current = false;
        refreshPromise.current = null;
      }
    };

    refreshPromise.current = doRefresh();
    return refreshPromise.current;
  }, [clearTokens]);

  /**
   * Start background token refresh timer.
   */
  const startRefreshTimer = useCallback(() => {
    // Clear existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    // Set up periodic refresh
    refreshTimerRef.current = setInterval(async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;

      try {
        await refreshToken();
      } catch (err) {
        logger.warn('Background token refresh failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }, REFRESH_INTERVAL_MS);
  }, [refreshToken]);

  /**
   * Stop background token refresh timer.
   */
  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Check auth on mount and set up refresh timer
  useEffect(() => {
    fetchUser();

    return () => {
      stopRefreshTimer();
    };
  }, [fetchUser, stopRefreshTimer]);

  // Start/stop refresh timer based on auth state
  useEffect(() => {
    if (user) {
      startRefreshTimer();
    } else {
      stopRefreshTimer();
    }
  }, [user, startRefreshTimer, stopRefreshTimer]);

  /**
   * Login with credentials.
   */
  const login = useCallback(
    async (credentials: LoginCredentials) => {
      try {
        const response = await fetch('/api/example-api/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          const error = await ApiError.fromResponse(response);
          logger.warn('Login failed', { status: response.status });
          throw error;
        }

        const tokens: AuthTokens = await response.json();

        localStorage.setItem(TOKEN_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

        logger.info('Login successful');

        // Fetch user data
        await fetchUser();
      } catch (err) {
        if (ApiError.isApiError(err)) {
          throw err;
        }
        logger.error('Login error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        throw new ApiError(0, 'Network error during login', 'NETWORK_ERROR');
      }
    },
    [fetchUser]
  );

  /**
   * Logout current user.
   */
  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);

    // Stop refresh timer immediately
    stopRefreshTimer();

    if (token) {
      try {
        await fetch('/api/example-api/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });
        logger.info('Logout successful');
      } catch {
        // Ignore logout API errors - we'll clear local state anyway
        logger.debug('Logout API call failed, clearing local state');
      }
    }

    clearTokens();
    setUser(null);
  }, [clearTokens, stopRefreshTimer]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshToken,
    }),
    [user, isLoading, login, logout, refreshToken]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * Hook to access auth context.
 *
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
