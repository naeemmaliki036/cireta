import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Pass login_role as audience for strict role enforcement
  // "admin" path → only admin users, "issuer" path → only issuer users
  const audience = body.login_role === "admin" ? "platform_admin" : body.login_role === "issuer" ? "issuer_only" : "admin";
  const { login_role: _lr, ...rest } = body;

  const res = await fetch(`${API_BASE}/api/v1/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, audience }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
