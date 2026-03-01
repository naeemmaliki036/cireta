import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/atoms/Button";
import { Badge } from "@/components/atoms/Badge";
import { Input } from "@/components/atoms/Input";

describe("Button", () => {
  it("renders with label", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeDefined();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Badge", () => {
  it("renders text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeDefined();
  });
});

describe("Input", () => {
  it("renders with placeholder", () => {
    render(<Input placeholder="Enter email" />);
    expect(screen.getByPlaceholderText("Enter email")).toBeDefined();
  });

  it("shows label when provided", () => {
    render(<Input label="Email" />);
    expect(screen.getByText("Email")).toBeDefined();
  });
});
