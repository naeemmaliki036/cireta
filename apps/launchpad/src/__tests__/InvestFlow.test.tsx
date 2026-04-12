import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryRow } from "@/components/organisms/BuyFlow";

describe("SummaryRow", () => {
  it("renders label and value", () => {
    render(<SummaryRow label="Amount" value="$1,000" />);
    expect(screen.getByText("Amount")).toBeDefined();
    expect(screen.getByText("$1,000")).toBeDefined();
  });
});

describe("USDC address via getUsdcAddress", () => {
  it("returns the correct Base mainnet address for chainId 8453", async () => {
    const { getUsdcAddress } = await import("@/lib/contracts/addresses");
    expect(getUsdcAddress(8453)).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });
});

describe("Sale ABI", () => {
  it("exports SALE_ABI with contribute function", async () => {
    const { SALE_ABI } = await import("@/lib/contracts/saleAbi");
    expect(SALE_ABI).toBeDefined();
    const contributeFn = SALE_ABI.find(
      (item) => "name" in item && item.name === "buy"
    );
    expect(contributeFn).toBeDefined();
  });

  it("exports ContributionMade event", async () => {
    const { SALE_ABI } = await import("@/lib/contracts/saleAbi");
    const event = SALE_ABI.find(
      (item) => "name" in item && item.name === "ContributionMade" && item.type === "event"
    );
    expect(event).toBeDefined();
  });
});

describe("Contract addresses", () => {
  it("returns Base mainnet USDC for chainId 8453", async () => {
    const { getUsdcAddress } = await import("@/lib/contracts/addresses");
    expect(getUsdcAddress(8453)).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("returns correct explorer URL for Base Sepolia", async () => {
    const { getExplorerUrl } = await import("@/lib/contracts/addresses");
    expect(getExplorerUrl(84532)).toBe("https://sepolia.basescan.org");
  });

  it("returns correct tx URL", async () => {
    const { getTxUrl } = await import("@/lib/contracts/addresses");
    const url = getTxUrl(8453, "0xabc");
    expect(url).toBe("https://basescan.org/tx/0xabc");
  });
});
