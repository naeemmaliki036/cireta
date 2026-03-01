import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryRow } from "@/components/organisms/InvestFlow";

describe("SummaryRow", () => {
  it("renders label and value", () => {
    render(<SummaryRow label="Amount" value="$1,000" />);
    expect(screen.getByText("Amount")).toBeDefined();
    expect(screen.getByText("$1,000")).toBeDefined();
  });
});

describe("USDC_ADDRESS", () => {
  it("is the correct Base mainnet address", async () => {
    const { USDC_ADDRESS } = await import("@/components/organisms/InvestFlow");
    expect(USDC_ADDRESS).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });
});
