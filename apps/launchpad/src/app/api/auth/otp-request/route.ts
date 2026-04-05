import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${API_BASE}/api/v1/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, audience: "investor" }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
