import { redirect } from "next/navigation";

/**
 * Spec alias: /portfolio/holdings → /portfolio
 * Holdings are displayed in the main portfolio page.
 */
export default function PortfolioHoldingsPage() {
  redirect("/portfolio");
}
