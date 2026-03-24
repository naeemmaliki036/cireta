import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings/profile",
}));

// Mock wagmi
vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: false, address: undefined }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
  useConnect: () => ({ connect: vi.fn(), connectors: [] }),
}));

const mockUser = {
  id: "u1",
  email: "test@cireta.com",
  role: "investor" as const,
  kyc_status: "approved" as const,
  kyc_level: 2,
  display_name: "Test User",
  email_verified: true,
  country_code: "US",
  investor_type: "individual",
};

const mockWallets = [
  {
    id: "w1", address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
    chain_id: 8453, is_primary: true, is_safe: false,
    registered_on_chain: true, label: null, linked_at: new Date().toISOString(),
    screening_status: "clear",
  },
];

// Mock repositories
vi.mock("@/lib/api/repositories/auth.repository", () => ({
  me: vi.fn().mockResolvedValue(mockUser),
  updateProfile: vi.fn().mockResolvedValue({ ...mockUser, display_name: "Updated Name" }),
}));

vi.mock("@/lib/api/repositories/wallets.repository", () => ({
  listWallets: vi.fn().mockResolvedValue(mockWallets),
  unlinkWallet: vi.fn(),
  setPrimaryWallet: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual("@/lib/api/client");
  return {
    ...actual,
    apiFetch: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/kyc/status")) {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve({});
    }),
    apiGet: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/kyc/status")) {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve({});
    }),
  };
});

describe("Profile page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders user email and KYC status", async () => {
    const ProfilePage = (await import("@/app/settings/profile/page")).default;
    render(<ProfilePage />);
    expect(await screen.findByText("test@cireta.com")).toBeDefined();
    expect(screen.getByText(/Level 2/)).toBeDefined();
  });

  it("renders linked wallets", async () => {
    const ProfilePage = (await import("@/app/settings/profile/page")).default;
    render(<ProfilePage />);
    expect(await screen.findByText(/0xAbCd/)).toBeDefined();
    expect(screen.getByText("Primary")).toBeDefined();
  });

  it("updates display name on save", async () => {
    const user = userEvent.setup();
    const ProfilePage = (await import("@/app/settings/profile/page")).default;
    render(<ProfilePage />);

    await screen.findByText("test@cireta.com");
    const input = screen.getByPlaceholderText("Your name") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "Updated Name");
    await user.click(screen.getByText("Save Changes"));

    const { updateProfile } = await import("@/lib/api/repositories/auth.repository");
    expect(updateProfile).toHaveBeenCalledWith({ display_name: "Updated Name" });
  });
});

describe("Verification page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KYC status and tier", async () => {
    const VerificationPage = (await import("@/app/settings/verification/page")).default;
    render(<VerificationPage />);
    expect(await screen.findByText("Verified")).toBeDefined();
    expect(screen.getByText(/Level 2/)).toBeDefined();
    expect(screen.getByText("approved")).toBeDefined();
  });

  it("shows investor type and country", async () => {
    const VerificationPage = (await import("@/app/settings/verification/page")).default;
    render(<VerificationPage />);
    await screen.findByText("Verified");
    expect(screen.getByText("individual")).toBeDefined();
    expect(screen.getByText("US")).toBeDefined();
  });
});

describe("Notifications page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders notification categories with toggles", async () => {
    const NotificationsPage = (await import("@/app/settings/notifications/page")).default;
    render(<NotificationsPage />);
    // Wait for loading to finish
    expect(await screen.findByText("Investment confirmations")).toBeDefined();
    expect(screen.getByText("KYC reminders")).toBeDefined();
    expect(screen.getByText("Sale updates")).toBeDefined();
    expect(screen.getByText("Dividend notifications")).toBeDefined();
  });

  it("toggles can be clicked", async () => {
    const user = userEvent.setup();
    const NotificationsPage = (await import("@/app/settings/notifications/page")).default;
    render(<NotificationsPage />);
    await screen.findByText("Investment confirmations");

    // Get the first email toggle (role=switch)
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(1);
    const firstSwitch = switches[0]!;
    await user.click(firstSwitch);
    // Toggle should change state — no error
  });

  it("saves preferences on button click", async () => {
    const user = userEvent.setup();
    const NotificationsPage = (await import("@/app/settings/notifications/page")).default;
    render(<NotificationsPage />);
    await screen.findByText("Save Preferences");
    await user.click(screen.getByText("Save Preferences"));

    const { apiFetch } = await import("@/lib/api/client");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/notifications/preferences",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
