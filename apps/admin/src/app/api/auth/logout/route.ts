import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("API_URL (or NEXT_PUBLIC_API_URL) is required. Set it in .env.local");
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  // Revoke the token on the backend if we have one
  if (token) {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});
  }

  cookieStore.delete("admin_token");
  return NextResponse.json({ success: true });
}
