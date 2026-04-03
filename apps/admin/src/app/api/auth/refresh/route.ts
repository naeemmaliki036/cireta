import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("admin_refresh")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${refreshToken}`,
    },
  });

  if (!res.ok) {
    cookieStore.delete("admin_token");
    cookieStore.delete("admin_refresh");
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = await res.json();

  cookieStore.set("admin_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });

  if (data.refresh_token) {
    cookieStore.set("admin_refresh", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  return NextResponse.json({ success: true });
}
