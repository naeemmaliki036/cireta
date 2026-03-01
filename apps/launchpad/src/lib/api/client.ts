const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
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

  const authToken = token ?? getStoredToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
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
