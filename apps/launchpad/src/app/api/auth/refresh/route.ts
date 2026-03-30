import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("launchpad_refresh")?.value;

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
    // Refresh failed — clear cookies
    cookieStore.delete("launchpad_token");
    cookieStore.delete("launchpad_refresh");
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = await res.json();

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
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return NextResponse.json({ success: true });
}
