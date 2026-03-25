const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

if (!process.env.NEXT_PUBLIC_API_URL && typeof window !== "undefined") {
  console.error(
    "NEXT_PUBLIC_API_URL not set — API calls will default to http://localhost:8000. " +
      "Set NEXT_PUBLIC_API_URL in your environment for production."
  );
}

/** In-memory access token store — set by AuthContext, never persisted to disk. */
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

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
  token?: string;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = "GET", body, token, headers: extraHeaders } = options;

  const authToken = token ?? _accessToken;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
    credentials: "include",
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // On 401, clear token and redirect to login (avoid infinite retry loops)
    if (response.status === 401 && typeof window !== "undefined") {
      _accessToken = null;
      const currentPath = window.location.pathname;
      if (currentPath !== "/login") {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        // Return a never-resolving promise to prevent further execution
        return new Promise<T>(() => {});
      }
    }
    throw new APIError(
      response.status,
      error.detail?.code ?? "UNKNOWN_ERROR",
      error.detail?.message ?? response.statusText
    );
  }

  return response.json();
}

export async function apiGet<T>(
  path: string,
  options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, { method: "GET", token: options?.token });
}

export async function apiPost<T, D = unknown>(
  path: string,
  data?: D,
  options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: data,
    token: options?.token,
  });
}

export async function apiPatch<T, D = unknown>(
  path: string,
  data?: D,
  options?: { token?: string }
): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: data,
    token: options?.token,
  });
}
