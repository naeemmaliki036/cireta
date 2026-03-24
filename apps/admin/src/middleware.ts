import { NextRequest, NextResponse } from "next/server";

/** Routes that do not require authentication. */
const PUBLIC_PATHS = ["/login", "/api", "/_next", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login
     * - /api/* (API routes)
     * - /_next/* (Next.js internals)
     * - /favicon.ico
     * - /_next/static/* (static assets)
     */
    "/((?!login|api|_next|favicon\\.ico).*)",
  ],
};
