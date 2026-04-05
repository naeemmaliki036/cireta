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
  const cookieStore = await cookies();
  cookieStore.set("launchpad_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });

  if (data.refresh_token) {
    cookieStore.set("launchpad_refresh", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days for investors
    });
  }

  return NextResponse.json({ success: true });
}
