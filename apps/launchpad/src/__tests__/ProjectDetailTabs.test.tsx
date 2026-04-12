import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "wassa-gold" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock wagmi — project detail page calls useChainId, and the embedded
// useOnChainSaleStats hook uses useReadContracts which we need to stub.
vi.mock("wagmi", () => ({
  useChainId: () => 8453,
  useAccount: () => ({ isConnected: false, address: undefined }),
  useReadContract: () => ({ data: undefined, isLoading: false }),
  useReadContracts: () => ({ data: undefined, isLoading: false }),
}));

// Mock AuthContext (project detail page calls useAuth)
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, accessToken: null }),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, accessToken: null }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
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

  it("renders all base tab buttons", async () => {
    render(<ProjectDetailPage />);
    await screen.findAllByText("Wassa Gold");
    // Base tabs (no OTC since the mocked sale has otc_enabled=false/undefined)
    expect(screen.getByRole("button", { name: "Overview" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Token & Sale" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Documents" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Team" })).toBeDefined();
    expect(screen.getByRole("button", { name: "FAQ" })).toBeDefined();
    expect(screen.getByRole("button", { name: "My Position" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Transactions" })).toBeDefined();
  });

  it("Token & Sale tab shows the Token Details and Sale Phases sections", async () => {
    render(<ProjectDetailPage />);
    await screen.findAllByText("Wassa Gold");
    fireEvent.click(screen.getByRole("button", { name: "Token & Sale" }));
    expect(screen.getByText("Token Details")).toBeDefined();
    expect(screen.getByText("Sale Phases")).toBeDefined();
  });
});
