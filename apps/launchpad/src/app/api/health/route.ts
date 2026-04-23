import { NextResponse } from "next/server";

/**
 * Health endpoint used by load balancers and uptime monitors.
 *
 * Railway, Cloudflare, and most probes issue `HEAD /` or `GET /api/health`
 * first — the App Router's page rendering returns 503 for `HEAD /` during
 * hydration, which makes the probe flap. Responding 200 here gives monitors
 * a stable target regardless of page-render state.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
