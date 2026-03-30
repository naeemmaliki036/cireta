import { NextResponse } from "next/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4010"}/api/auth/callback/google`;

/**
 * GET /api/auth/google — Redirect to Google OAuth consent screen
 */
export async function GET() {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: "Google login not configured" },
      { status: 501 }
    );
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
