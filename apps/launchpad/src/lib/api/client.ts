const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RequestOptions extends RequestInit {
  token?: string;
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

async function handleResponse<T>(response: Response): Promise<T> {
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
  options?: RequestOptions
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
    ...options,
  });

  return handleResponse<T>(response);
}

export async function apiPost<T, D = unknown>(
  path: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });

  return handleResponse<T>(response);
}

export async function apiPatch<T, D = unknown>(
  path: string,
  data?: D,
  options?: RequestOptions
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });

  return handleResponse<T>(response);
}
