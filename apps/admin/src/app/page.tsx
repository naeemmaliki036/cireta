import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminRootPage() {
  // Attempt to determine role from JWT payload for routing
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  
  if (token) {
    try {
      // Decode JWT payload (base64) to check role
      const parts = token.split(".");
      if (parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64").toString()
        );
        if (payload.role === "admin") {
          redirect("/platform/issuers");
        }
      }
    } catch {
      // Ignore decode errors, fall through to default
    }
  }
  
  redirect("/issuer/overview");
}
