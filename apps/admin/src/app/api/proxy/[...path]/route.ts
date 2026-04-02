import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Disable Next.js route handler caching — all proxy calls must hit the backend
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("API_URL (or NEXT_PUBLIC_API_URL) is required. Set it in .env.local");
}

async function handler(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  // Strip the /api/proxy prefix to get the real backend path
  const backendPath = request.nextUrl.pathname.replace(/^\/api\/proxy/, "");
  const url = `${API_BASE}${backendPath}${request.nextUrl.search}`;

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.startsWith("multipart/form-data");

  const headers: Record<string, string> = {};
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  } else {
    // Forward the original content-type with boundary intact
    headers["Content-Type"] = contentType;
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchInit: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (isMultipart) {
      // Forward raw multipart body (preserves file boundaries)
      fetchInit.body = Buffer.from(await request.arrayBuffer());
    } else {
      const body = await request.text();
      if (body) {
        fetchInit.body = body;
      }
    }
  }

  try {
    const res = await fetch(url, fetchInit);

    // 204 No Content must have null body
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const contentType = res.headers.get("content-type") ?? "application/json";
    const responseBody = await res.arrayBuffer();

    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("[proxy] fetch error:", url, err);
    return NextResponse.json(
      { detail: { code: "PROXY_ERROR", message: String(err) } },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
