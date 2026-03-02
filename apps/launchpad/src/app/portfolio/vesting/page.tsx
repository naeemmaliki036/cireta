import { redirect } from "next/navigation";

/**
 * Spec alias: /portfolio/vesting → /portfolio
 * Vesting schedules are displayed in the main portfolio page.
 */
export default function PortfolioVestingPage() {
  redirect("/portfolio");
}
