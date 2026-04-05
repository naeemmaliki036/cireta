import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${API_BASE}/api/v1/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return NextResponse.json(error, { status: res.status });
  }

  const data = await res.json();

  // Set auth cookies — access + refresh tokens
  const cookieStore = await cookies();
  cookieStore.set("admin_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15, // 15 minutes — matches access token lifetime
  });

  if (data.refresh_token) {
    cookieStore.set("admin_refresh", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours — admin/issuer refresh lifetime
    });
  }

  return NextResponse.json({ success: true, role: data.role ?? null });
}
