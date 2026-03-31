import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();

  // Delete all auth cookies
  cookieStore.delete("cireta_auth");
  cookieStore.delete("token");
  cookieStore.delete("launchpad_token");
  cookieStore.delete("refresh_token");

  // Return a simple HTML page that clears client-side storage and redirects
  const html = `<!DOCTYPE html>
<html>
<head><title>Clearing...</title></head>
<body>
<p>Clearing session...</p>
<script>
try { sessionStorage.clear(); } catch(e) {}
try {
  Object.keys(localStorage).forEach(function(k) {
    if (k.startsWith('wagmi') || k.startsWith('cireta_') || k.startsWith('rk-') || k.startsWith('wc@')) {
      localStorage.removeItem(k);
    }
  });
} catch(e) {}
document.cookie = "cireta_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
document.cookie = "launchpad_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
document.cookie = "refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
setTimeout(function() { window.location.href = "/"; }, 500);
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
