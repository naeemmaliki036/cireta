import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4010";
const REDIRECT_URI = `${APP_URL}/api/auth/callback/google`;
const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

/**
 * GET /api/auth/callback/google — Google redirects here after user consents
 *
 * 1. Exchange code for Google tokens
 * 2. Send ID token to our API
 * 3. Set auth cookie
 * 4. Redirect to home
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${APP_URL}/login?error=google_cancelled`);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${APP_URL}/login?error=google_token_failed`);
    }

    const tokens = await tokenRes.json();
    const idToken = tokens.id_token;

    if (!idToken) {
      return NextResponse.redirect(`${APP_URL}/login?error=no_id_token`);
    }

    // Send ID token to our API for verification + user creation
    const apiRes = await fetch(`${API_BASE}/api/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      console.error("API google auth failed:", err);
      return NextResponse.redirect(
        `${APP_URL}/login?error=${err.detail?.code || "google_auth_failed"}`
      );
    }

    const data = await apiRes.json();

    // Set auth cookie
    const cookieStore = await cookies();
    cookieStore.set("launchpad_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    // Redirect to home
    return NextResponse.redirect(APP_URL);
  } catch (err) {
    console.error("Google auth error:", err);
    return NextResponse.redirect(`${APP_URL}/login?error=google_error`);
  }
}
