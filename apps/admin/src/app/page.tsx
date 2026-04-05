import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

export default async function AdminRootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    redirect("/login");
  }

  // Check role via API
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const user = await res.json();
      if (user.role === "admin") {
        redirect("/platform/overview");
      }
    }
  } catch {
    // Fall through to issuer view
  }

  redirect("/issuer/overview");
}
