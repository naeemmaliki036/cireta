/**
 * Single source of truth for "what status is this sale in?" — used by the
 * home page card, the projects listing card, and the project detail
 * sidebar so all three agree on label and tone.
 *
 * The DB `status` column lags behind real-world state — a sale stays at
 * "active" until an issuer/admin finalizes it, even after every phase has
 * ended. The home card already inferred "Completed" from phase end-times,
 * but the detail page badge kept reading raw DB status, so the two
 * disagreed visually. This helper consolidates the rules.
 */

export type SaleStatusKind =
  | "draft"
  | "pending_launch"
  | "coming_soon"
  | "upcoming"
  | "active"
  | "completed"
  | "completed_with_refund";

export type SaleStatusTone = "neutral" | "active" | "completed" | "warn";

export interface SaleStatusBadge {
  kind: SaleStatusKind;
  label: string;
  tone: SaleStatusTone;
  /** A small status dot colour expressed as a tailwind class. */
  dotClass: string;
  /** Pill background+text for use on light surfaces. */
  pillClass: string;
}

interface PhaseLike {
  start_time?: string | null;
  end_time?: string | null;
}

export interface SaleStatusInput {
  /** DB status string ("draft" / "active" / "approved" / ...). */
  status?: string | null;
  phases?: PhaseLike[];
  isComingSoon?: boolean;
  isOpenEnded?: boolean;
  refundsActivatedAt?: string | null;
}

// All tones use only brand colours (white, light-aqua via tailwind lightAqua,
// darkAqua, black) per the project's design rule. Active = solid darkAqua
// to draw attention; refund-available = inverted (white on darkAqua); every
// other state uses a muted neutral pill so they don't compete for the eye.
const COMPLETED: SaleStatusBadge = {
  kind: "completed",
  label: "Completed",
  tone: "completed",
  dotClass: "bg-black/30",
  pillClass: "bg-black/5 text-black/60",
};

const REFUND: SaleStatusBadge = {
  kind: "completed_with_refund",
  label: "Closed — Refund Available",
  tone: "warn",
  dotClass: "bg-white",
  pillClass: "bg-darkAqua text-white",
};

const ACTIVE: SaleStatusBadge = {
  kind: "active",
  label: "Active",
  tone: "active",
  dotClass: "bg-darkAqua",
  pillClass: "bg-darkAqua/10 text-darkAqua",
};

const COMING_SOON: SaleStatusBadge = {
  kind: "coming_soon",
  label: "Coming Soon",
  tone: "neutral",
  dotClass: "bg-black/30",
  pillClass: "bg-black/5 text-black/60",
};

const UPCOMING: SaleStatusBadge = {
  kind: "upcoming",
  label: "Upcoming",
  tone: "neutral",
  dotClass: "bg-black/30",
  pillClass: "bg-black/5 text-black/60",
};

const PENDING_LAUNCH: SaleStatusBadge = {
  kind: "pending_launch",
  label: "Pending Launch",
  tone: "neutral",
  dotClass: "bg-darkAqua/40",
  pillClass: "bg-darkAqua/10 text-darkAqua",
};

const DRAFT: SaleStatusBadge = {
  kind: "draft",
  label: "Draft",
  tone: "neutral",
  dotClass: "bg-black/30",
  pillClass: "bg-black/5 text-black/60",
};

export function getEffectiveSaleStatus(input: SaleStatusInput): SaleStatusBadge {
  // Coming-soon flag wins regardless of DB status.
  if (input.isComingSoon || input.status === "approved_coming_soon") {
    return COMING_SOON;
  }

  const phases = input.phases ?? [];
  const now = Date.now();

  const hasPhases = phases.length > 0;
  const allPhasesEnded =
    hasPhases &&
    phases.every((p) => p.end_time && new Date(p.end_time).getTime() <= now);
  const hasActivePhase = phases.some(
    (p) =>
      p.start_time &&
      p.end_time &&
      new Date(p.start_time).getTime() <= now &&
      now < new Date(p.end_time).getTime(),
  );
  const allPhasesUpcoming =
    hasPhases &&
    phases.every((p) => p.start_time && new Date(p.start_time).getTime() > now);

  // 1. Real-world ended → completed (regardless of DB status). This is
  //    the "Completed" the user sees on the home card; the detail page
  //    must agree.
  if (allPhasesEnded) {
    return input.refundsActivatedAt ? REFUND : COMPLETED;
  }

  // 2. DB-side terminal states.
  if (input.status === "finalized_success" || input.status === "finalized") {
    return COMPLETED;
  }
  if (input.status === "finalized_failed" || input.status === "failed") {
    return input.refundsActivatedAt ? REFUND : COMPLETED;
  }

  // 3. Currently selling.
  if (hasActivePhase || (input.status === "active" && !allPhasesUpcoming)) {
    return input.isOpenEnded
      ? { ...ACTIVE, label: "Active — Open-Ended" }
      : ACTIVE;
  }

  // 4. Approved/upcoming sales whose phases haven't started.
  if (input.status === "approved" || allPhasesUpcoming) {
    return input.status === "approved" && !hasPhases
      ? PENDING_LAUNCH
      : UPCOMING;
  }

  if (input.status === "draft") return DRAFT;
  if (input.status === "pending_approval") return PENDING_LAUNCH;

  return DRAFT;
}
