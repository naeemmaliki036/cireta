import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("API_URL (or NEXT_PUBLIC_API_URL) is required. Set it in .env.local");
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Admin portal uses the dedicated issuer registration endpoint
  // which enforces whitelist check server-side
  const res = await fetch(`${API_BASE}/api/v1/auth/register/issuer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return NextResponse.json(error, { status: res.status });
  }

  return NextResponse.json({ success: true });
}
