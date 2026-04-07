import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Disable Next.js route handler caching — all proxy calls must hit the backend
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

async function handler(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("launchpad_token")?.value;

  const backendPath = request.nextUrl.pathname.replace(/^\/api\/proxy/, "");
  const url = `${API_BASE}${backendPath}${request.nextUrl.search}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Use manual redirects to prevent body loss on 307/308 redirects
  const fetchInit: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  let rawBody: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.text();
    if (body) {
      rawBody = body;
      fetchInit.body = body;
    }
  }

  let res = await fetch(url, fetchInit);

  // Follow 307/308 redirects manually, preserving method and body
  if (res.status === 307 || res.status === 308) {
    const location = res.headers.get("location");
    if (location) {
      const redirectUrl = location.startsWith("http") ? location : `${API_BASE}${location}`;
      res = await fetch(redirectUrl, {
        method: request.method,
        headers,
        body: rawBody,
        redirect: "manual",
      });
    }
  }

  // 204 No Content — return empty response (no body allowed)
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const contentType = res.headers.get("content-type") ?? "application/json";
  const responseBody = await res.arrayBuffer();

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
