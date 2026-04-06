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

  const fetchInit: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.text();
    if (body) {
      fetchInit.body = body;
    }
  }

  const res = await fetch(url, fetchInit);

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
