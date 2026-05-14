import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock wagmi
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: true, address: "0x1234" }),
  useWriteContract: () => ({ writeContract: vi.fn(), data: undefined, isPending: false, error: null }),
  useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
  useReadContract: () => ({ data: undefined, isLoading: false }),
  useChainId: () => 8453,
  useConnect: () => ({ connect: vi.fn(), connectors: [] }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/portfolio",
  redirect: vi.fn(),
}));

// Mock framer-motion — include motion.button for the Button atom
vi.mock("framer-motion", () => {
  function makeMotion(tag: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Comp = (props: any) => {
      const { children, initial: _initial, animate: _animate, transition: _transition, whileInView: _whileInView, viewport: _viewport, whileTap: _whileTap, ...rest } = props;
      if (tag === "button") return <button {...rest}>{children}</button>;
      return <div {...rest}>{children}</div>;
    };
    Comp.displayName = `motion.${tag}`;
    return Comp;
  }
  return {
    motion: new Proxy({} as Record<string, unknown>, { get: (_t, prop: string) => makeMotion(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock DashboardLayout
vi.mock("@/components/templates", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, accessToken: "test-token" }),
}));

// Use inline data in mock factories to avoid hoisting issues
const portfolioMock = {
  getPortfolio: vi.fn().mockImplementation(() => Promise.resolve({
    holdings: [
      { token_id: "t1", token_name: "Wassa Gold", token_symbol: "WMAU", asset_type: "commodity", balance: "100", value_usd: "8500", claimable: "0" },
      { token_id: "t2", token_name: "Dubai Towers", token_symbol: "DTWR", asset_type: "real_estate", balance: "50", value_usd: "5750", claimable: "10" },
    ],
    total_value_usd: "14250",
    total_invested_usd: "12000",
  })),
  getVesting: vi.fn().mockImplementation(() => Promise.resolve([
    {
      id: "v1", token_id: "t1", token_name: "Wassa Gold", token_symbol: "WMAU",
      total_amount: "200", claimed_amount: "50", claimable_amount: "25",
      cliff_end: new Date(Date.now() - 86400000).toISOString(),
      vesting_end: new Date(Date.now() + 86400000 * 90).toISOString(),
      last_claim_at: null, sale_mode: "vested", vault_address: "0xvault", sale_contract_address: null,
    },
  ])),
  getDividends: vi.fn().mockImplementation(() => Promise.resolve([
    { token_symbol: "WMAU", token_name: "Wassa Gold", claimable_usdc: "150", total_earned: "300", contract_address: "0xdiv" },
  ])),
  getTransactions: vi.fn().mockImplementation(() => Promise.resolve({
    transactions: [
      { type: "investment", amount: "5000", tx_hash: "0xabc123def456", status: "confirmed", created_at: new Date().toISOString() },
      { type: "claim", amount: "100", tx_hash: null, status: "pending", created_at: null },
    ],
    total: 2,
  })),
};

vi.mock("@/lib/api/repositories/portfolio.repository", () => portfolioMock);

// Prevent safeClient from calling getChainId() at module-load time
vi.mock("@/lib/safe/safeClient", () => ({
  proposeTransaction: vi.fn(),
  getTransaction: vi.fn(),
  getSafeTxUrl: vi.fn(),
  initSafe: vi.fn(),
  initSafeApiKit: vi.fn(),
  getPendingTransactions: vi.fn(),
  getSafeInfo: vi.fn(),
}));

// Stub the contract action hook used by vesting/dividends pages
vi.mock("@/hooks/useContractAction", () => ({
  useContractAction: () => ({
    execute: vi.fn(),
    state: "idle" as const,
    txHash: null,
    txUrl: null,
    error: null,
    reset: vi.fn(),
  }),
}));

describe("Holdings page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders holdings data from API", async () => {
    portfolioMock.getPortfolio.mockImplementation(() => Promise.resolve({
      holdings: [
        { token_id: "t1", token_name: "Wassa Gold", token_symbol: "WMAU", asset_type: "commodity", balance: "100", value_usd: "8500", claimable: "0" },
      ],
      total_value_usd: "8500",
      total_invested_usd: "5000",
    }));
    const HoldingsPage = (await import("@/app/portfolio/holdings/page")).default;
    render(<HoldingsPage />);
    expect(await screen.findByText("Wassa Gold")).toBeDefined();
    expect(screen.getByText("WMAU")).toBeDefined();
  });
});

describe("Vesting page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders vesting schedules from API", async () => {
    portfolioMock.getVesting.mockImplementation(() => Promise.resolve([
      {
        id: "v1", token_id: "t1", token_name: "Wassa Gold", token_symbol: "WMAU",
        total_amount: "200", claimed_amount: "50", claimable_amount: "25",
        cliff_end: new Date(Date.now() - 86400000).toISOString(),
        vesting_end: new Date(Date.now() + 86400000 * 90).toISOString(),
        last_claim_at: null, sale_mode: "vested", vault_address: "0xvault", sale_contract_address: null,
      },
    ]));
    const VestingPage = (await import("@/app/portfolio/vesting/page")).default;
    render(<VestingPage />);
    expect(await screen.findByText("Wassa Gold")).toBeDefined();
    expect(screen.getByText("Claim Schedule")).toBeDefined();
  });
});

describe("Dividends page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders dividends data from API", async () => {
    portfolioMock.getDividends.mockImplementation(() => Promise.resolve([
      { token_symbol: "WMAU", token_name: "Wassa Gold", claimable_usdc: "150", total_earned: "300", contract_address: "0xdiv" },
    ]));
    const DividendsPage = (await import("@/app/portfolio/dividends/page")).default;
    render(<DividendsPage />);
    expect(await screen.findByText("Wassa Gold")).toBeDefined();
    // claimable amount and unit are rendered in sibling nodes — check each independently
    expect(screen.getByText("150")).toBeDefined();
    expect(screen.getAllByText(/USDC/).length).toBeGreaterThan(0);
  });
});

describe("Transactions page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders transaction history from API", async () => {
    portfolioMock.getTransactions.mockImplementation(() => Promise.resolve({
      transactions: [
        { type: "investment", amount: "5000", tx_hash: "0xabc123def456", status: "confirmed", created_at: new Date().toISOString() },
      ],
      total: 1,
    }));
    const TxPage = (await import("@/app/portfolio/transactions/page")).default;
    render(<TxPage />);
    // After the rename, "investment" tx-type renders the label "Buy"
    expect(await screen.findByText("Buy")).toBeDefined();
    expect(screen.getByText("Confirmed")).toBeDefined();
    // BaseScan link is rendered as an <a> wrapping a truncated tx hash
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toContain("0xabc123def456");
  });
});

describe("Empty states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("holdings shows empty state", async () => {
    portfolioMock.getPortfolio.mockImplementation(() => Promise.resolve({
      holdings: [], total_value_usd: "0", total_invested_usd: "0",
    }));
    const HoldingsPage = (await import("@/app/portfolio/holdings/page")).default;
    render(<HoldingsPage />);
    expect(await screen.findByText("No holdings yet")).toBeDefined();
  });

  it("transactions shows empty state", async () => {
    portfolioMock.getTransactions.mockImplementation(() => Promise.resolve({
      transactions: [],
      total: 0,
    }));
    const TxPage = (await import("@/app/portfolio/transactions/page")).default;
    render(<TxPage />);
    expect(await screen.findByText("No transactions yet")).toBeDefined();
  });
});
