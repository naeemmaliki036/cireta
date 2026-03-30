import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("launchpad_token")?.value;

  if (token) {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});
  }

  cookieStore.delete("launchpad_token");
  cookieStore.delete("launchpad_refresh");
  return NextResponse.json({ success: true });
}
