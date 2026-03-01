import { describe, it, expect } from "vitest";

// Test the formatCurrency utility
describe("formatCurrency", () => {
  it("formats positive numbers with $ prefix", async () => {
    const { formatCurrency } = await import("@/lib/utils");
    expect(formatCurrency(1000)).toContain("1,000");
    expect(formatCurrency(1000)).toContain("$");
  });

  it("formats zero correctly", async () => {
    const { formatCurrency } = await import("@/lib/utils");
    const result = formatCurrency(0);
    expect(result).toContain("$");
  });

  it("formats large numbers with commas", async () => {
    const { formatCurrency } = await import("@/lib/utils");
    const result = formatCurrency(1500000);
    expect(result).toContain("1,500,000");
  });
});
