import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "wassa-gold" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, ...rest } = props;
    return <img {...rest} />;
  },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial: _i, animate: _a, transition: _t, whileInView: _w, viewport: _v, ...rest } = props;
      return <div {...rest}>{children as React.ReactNode}</div>;
    },
  },
}));

vi.mock("@/components/organisms", () => ({
  Navbar: () => <nav data-testid="navbar" />,
  Footer: () => <footer data-testid="footer" />,
  InvestSidebar: () => <div data-testid="invest-sidebar" />,
}));

// Mock API — use factory functions that return inline data
vi.mock("@/lib/api/repositories/projects.repository", () => ({
  getProject: vi.fn().mockImplementation(() => Promise.resolve({
    id: "sale-1", title: "Wassa Gold", slug: "wassa-gold", imageUrl: "", assetType: "commodity",
    fundingRound: "Seed", currentRaised: 150000, targetAmount: 500000, investorCount: 42,
    status: "active", tokenSymbol: "WMAU", description: "Gold-backed token",
    issuer: { id: "i1", name: "Cireta Capital", slug: "cireta-capital" },
    phases: [
      { id: "p1", phase_number: 1, name: "Seed", price_per_token: "85", allocation: "200000",
        min_contribution: "500", max_contribution: "50000",
        start_time: new Date(Date.now() - 30 * 86400000).toISOString(),
        end_time: new Date(Date.now() - 10 * 86400000).toISOString(),
        whitelist_only: true, is_active: false },
      { id: "p2", phase_number: 2, name: "Private", price_per_token: "100", allocation: "300000",
        min_contribution: "1000", max_contribution: "100000",
        start_time: new Date(Date.now() - 5 * 86400000).toISOString(),
        end_time: new Date(Date.now() + 10 * 86400000).toISOString(),
        whitelist_only: false, is_active: true },
    ],
  })),
  getSaleRawBySlug: vi.fn().mockImplementation(() => Promise.resolve({
    id: "sale-1", token_id: "tok-1", issuer_id: "i1", payment_token: "USDC",
    soft_cap: "100000", hard_cap: "500000", status: "active", total_raised: "150000",
    is_active: true, phases: [], contract_address: "0x1234567890abcdef1234567890abcdef12345678",
  })),
}));

vi.mock("@/lib/api/repositories/tokens", () => ({
  getToken: vi.fn().mockImplementation(() => Promise.resolve({
    id: "tok-1", name: "Wassa Gold", symbol: "WMAU", asset_type: "commodity",
    contract_address: "0x1234567890abcdef1234567890abcdef12345678",
    total_supply: "2880", decimals: 18, ipfs_docs_hash: null, chainlink_por_feed: null,
    is_paused: false, created_at: new Date().toISOString(),
    issuer: { id: "i1", name: "Cireta Capital", slug: "cireta-capital" },
  })),
}));

import ProjectDetailPage from "@/app/project/[slug]/page";

describe("Project Detail Tabs", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders all 6 tab buttons", async () => {
    render(<ProjectDetailPage />);
    await screen.findByText("Wassa Gold");
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("Phases")).toBeDefined();
    expect(screen.getByText("Documents")).toBeDefined();
    expect(screen.getByText("Team")).toBeDefined();
    expect(screen.getByText("Financials")).toBeDefined();
    expect(screen.getByText("Token Details")).toBeDefined();
  });

  it("Financials tab shows total raised and fee structure", async () => {
    render(<ProjectDetailPage />);
    await screen.findByText("Wassa Gold");
    fireEvent.click(screen.getByText("Financials"));
    expect(screen.getByText("Fundraising Summary")).toBeDefined();
    expect(screen.getByText("Fee Structure")).toBeDefined();
    expect(screen.getByText("Platform Fee")).toBeDefined();
    expect(screen.getByText("2.5%")).toBeDefined();
  });

  it("Token Details tab shows ERC-3643 and compliance modules", async () => {
    render(<ProjectDetailPage />);
    await screen.findByText("Wassa Gold");
    fireEvent.click(screen.getByText("Token Details"));
    expect(screen.getByText("Token Information")).toBeDefined();
    expect(screen.getByText("ERC-3643")).toBeDefined();
    expect(screen.getByText("Compliance Modules")).toBeDefined();
    expect(screen.getByText("Identity Registry")).toBeDefined();
    expect(screen.getByText("Transfer Restrictions")).toBeDefined();
  });
});
