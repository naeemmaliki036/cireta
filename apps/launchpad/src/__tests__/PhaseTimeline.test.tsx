import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseTimeline } from "@/components/molecules/PhaseTimeline";
import type { ProjectPhase } from "@/lib/api/repositories/projects.repository";

const now = new Date();
const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const pastEnd = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
const futureStart = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000);
const activeStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
const activeEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

function makePhase(overrides: Partial<ProjectPhase> & { phase_number: number; name: string }): ProjectPhase {
  return {
    id: `phase-${overrides.phase_number}`,
    price_per_token: "100",
    allocation: "500000",
    min_contribution: "500",
    max_contribution: "50000",
    start_time: activeStart.toISOString(),
    end_time: activeEnd.toISOString(),
    whitelist_only: false,
    is_active: false,
    ...overrides,
  };
}

const phases: ProjectPhase[] = [
  makePhase({
    phase_number: 1,
    name: "Seed Round",
    price_per_token: "85",
    start_time: pastDate.toISOString(),
    end_time: pastEnd.toISOString(),
    is_active: false,
  }),
  makePhase({
    phase_number: 2,
    name: "Private Sale",
    price_per_token: "100",
    start_time: activeStart.toISOString(),
    end_time: activeEnd.toISOString(),
    is_active: true,
  }),
  makePhase({
    phase_number: 3,
    name: "Retail Sale",
    price_per_token: "115",
    start_time: futureStart.toISOString(),
    end_time: futureEnd.toISOString(),
    is_active: false,
  }),
];

describe("PhaseTimeline", () => {
  it("renders all 3 phases with their names", () => {
    render(<PhaseTimeline phases={phases} />);
    expect(screen.getAllByText("Seed Round").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Private Sale").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Retail Sale").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights the active phase with 'Live' badge", () => {
    render(<PhaseTimeline phases={phases} />);
    const liveBadges = screen.getAllByText("Live");
    expect(liveBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Upcoming' badge for future phases", () => {
    render(<PhaseTimeline phases={phases} />);
    const upcomingBadges = screen.getAllByText("Upcoming");
    expect(upcomingBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Sold' badge for completed phases", () => {
    render(<PhaseTimeline phases={phases} />);
    const soldBadges = screen.getAllByText("Sold");
    expect(soldBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("displays price per token for each phase", () => {
    render(<PhaseTimeline phases={phases} />);
    // formatCurrency drops .00 for whole numbers, so $85 / $100 / $115
    expect(screen.getAllByText(/\$85\b/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$100\b/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\$115\b/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state when no phases", () => {
    render(<PhaseTimeline phases={[]} />);
    expect(screen.getByText("No sale phases available.")).toBeDefined();
  });
});
