import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = ["/portfolio", "/account", "/invest", "/settings"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("token")?.value;
  if (token) {
    return NextResponse.next();
  }

  // Check for client-side auth cookie set by AuthContext on login
  const authFlag = request.cookies.get("cireta_auth")?.value;
  if (authFlag === "1") {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/portfolio/:path*", "/account/:path*", "/invest/:path*", "/settings/:path*"],
};
