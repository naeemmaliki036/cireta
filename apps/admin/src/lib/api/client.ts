/**
 * Admin API client — all requests go through /api/proxy/ which reads
 * the httpOnly cookie and attaches the Authorization header server-side.
 * The JWT is NEVER accessible to client-side JavaScript.
 */

/** @deprecated Token is managed via httpOnly cookie. Returns null (kept for backward compat). */
export function setAccessToken(_token: string | null): void {
  // No-op: JWT is now stored in httpOnly cookie, not in JS memory
}

/** @deprecated Token is managed via httpOnly cookie. Returns null (kept for backward compat). */
export function getAccessToken(): string | null {
  return null;
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
  /** @deprecated Token is now managed via httpOnly cookie. This param is ignored. */
  token?: string;
  headers?: Record<string, string>;
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

  // All API calls are proxied through Next.js route handler which
  // reads the httpOnly cookie and attaches Authorization server-side.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const response = await fetch(`/api/proxy${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
    credentials: "include",
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // On 401, redirect to login (JWT expired or invalid)
    if (response.status === 401 && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (currentPath !== "/login") {
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

  // Handle 204 No Content (e.g. DELETE responses)
  if (response.status === 204) {
    return undefined as T;
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

export async function apiDelete(
  path: string,
): Promise<void> {
  await apiFetch<void>(path, { method: "DELETE" });
}

// --- File Upload ---

export interface UploadResult {
  url: string;
  path: string;
  content_type: string;
  size: number;
  private: boolean;
}

export function apiUpload(
  file: File,
  prefix = "general",
  visibility: "auto" | "public" | "private" = "auto",
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/proxy/api/v1/uploads?prefix=${encodeURIComponent(prefix)}&visibility=${visibility}`,
    );
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } else {
        const err = JSON.parse(xhr.responseText).detail;
        reject(new APIError(xhr.status, err?.code ?? "UPLOAD_ERROR", err?.message ?? "Upload failed"));
      }
    };

    xhr.onerror = () => reject(new APIError(0, "NETWORK_ERROR", "Upload failed"));
    xhr.send(formData);
  });
}
