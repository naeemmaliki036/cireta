/**
 * API client — all requests go through /api/proxy which attaches
 * the httpOnly JWT cookie server-side. No token in JavaScript memory.
 */

export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  token?: string; // Deprecated — kept for backward compat, ignored
  headers?: Record<string, string>;
  /** If true, don't auto-redirect to /login on 401 */
  skipAuthRedirect?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = "GET", body, headers: extraHeaders } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  // Route through Next.js proxy which attaches httpOnly cookie
  const proxyPath = `/api/proxy${path}`;

  const response = await fetch(proxyPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401 && !options.skipAuthRedirect && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/login" && currentPath !== "/register") {
        // Try silent refresh before redirecting
        const refreshRes = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" }).catch(() => null);
        if (refreshRes?.ok) {
          // Retry original request with fresh token
          const retryRes = await fetch(proxyPath, {
            method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: undefined,
          });
          if (retryRes.ok) {
            return retryRes.status === 204 ? (undefined as unknown as T) : retryRes.json();
          }
        }
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        return new Promise<T>(() => {});
      }
    }
    throw new APIError(
      response.status,
      error.detail?.code ?? "UNKNOWN_ERROR",
      error.detail?.message ?? response.statusText
    );
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json();
}

export async function apiGet<T>(
  path: string,
  _options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export async function apiPost<T, D = unknown>(
  path: string,
  data?: D,
  _options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: data });
}

export async function apiPatch<T, D = unknown>(
  path: string,
  data?: D,
  _options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: data });
}
