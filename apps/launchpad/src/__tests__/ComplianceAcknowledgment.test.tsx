import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvestApproveStep } from "@/components/organisms/BuyFlow";

describe("InvestApproveStep — Compliance Acknowledgment", () => {
  const defaultProps = {
    amount: 5000,
    isLoading: false,
    error: null,
    onApprove: () => {},
  };

  it("renders the jurisdiction compliance checkbox", () => {
    render(<InvestApproveStep {...defaultProps} />);
    expect(screen.getByTestId("jurisdiction-checkbox")).toBeDefined();
    expect(
      screen.getByText(/I confirm I am not a resident of a restricted jurisdiction/)
    ).toBeDefined();
  });

  it("displays the tokenized-securities disclosure text", () => {
    render(<InvestApproveStep {...defaultProps} />);
    expect(
      screen.getByText(/This purchase involves tokenized securities/)
    ).toBeDefined();
  });

  it("approve button is disabled when checkbox is unchecked", () => {
    render(<InvestApproveStep {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /approve usdc/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("approve button is enabled when the checkbox is checked", async () => {
    const user = userEvent.setup();
    render(<InvestApproveStep {...defaultProps} />);

    await user.click(screen.getByTestId("jurisdiction-checkbox"));

    const btn = screen.getByRole("button", { name: /approve usdc/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onApprove when checked and button clicked", async () => {
    const user = userEvent.setup();
    let approved = false;
    render(
      <InvestApproveStep
        {...defaultProps}
        onApprove={() => {
          approved = true;
        }}
      />
    );

    await user.click(screen.getByTestId("jurisdiction-checkbox"));
    await user.click(screen.getByRole("button", { name: /approve usdc/i }));

    expect(approved).toBe(true);
  });
});
