"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, UserPlus, Wallet, ShieldCheck, Coins,
  ChevronRight, X, Check,
} from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "wagmi";

interface TourStep {
  icon: typeof Play;
  title: string;
  description: string;
  doneDescription: string;
  targetId?: string;
  completedKey?: "authenticated" | "walletConnected" | "verified";
}

const ALL_STEPS: TourStep[] = [
  {
    icon: Play,
    title: "How To?",
    description: "A quick walkthrough to help you navigate the Cireta Launchpad.",
    doneDescription: "A quick walkthrough to help you navigate the Cireta Launchpad.",
  },
  {
    icon: UserPlus,
    title: "Sign Up",
    description: "Create your account to access purchase opportunities.",
    doneDescription: "Account created. You're registered.",
    targetId: "register",
    completedKey: "authenticated",
  },
  {
    icon: Wallet,
    title: "Connect Your Wallet",
    description: "Link your crypto wallet to participate in token sales.",
    doneDescription: "Wallet connected.",
    targetId: "connect-wallet",
    completedKey: "walletConnected",
  },
  {
    icon: ShieldCheck,
    title: "Get Verified (KYC/KYB)",
    description: "Complete identity verification to unlock purchases.",
    doneDescription: "Identity verified. You're ready to buy.",
    // No targetId: verification happens inside flows reached from the user
    // menu and onboarding pages, so pointing at a single navbar element
    // would be misleading. The tour shows a full dim instead.
    completedKey: "verified",
  },
  {
    icon: Coins,
    title: "Buy Token",
    description: "Purchase tokens via crypto or OTC bank transfer.",
    doneDescription: "Purchase tokens via crypto or OTC bank transfer.",
  },
];

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Horizontal centre of the target in viewport coordinates — used by the
   *  tooltip to anchor its arrow so rewriting the position math for each
   *  piece doesn't drift. */
  centerX: number;
  /** True once the target has been scrolled into view; the spotlight
   *  renders at full opacity only after this flips so the first frame
   *  doesn't flash in the wrong place while we scroll. */
  stable: boolean;
}

/**
 * Measure the tour target on mount / resize / scroll and scroll it into
 * view. Returns `null` until the element is in the DOM.
 */
function useTargetRect(targetId: string | undefined): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);

  // Pick the first element with this tour id that is actually visible in the
  // layout. Two reasons for the multi-match + visibility filter:
  //   1. Some targets (e.g. Buy Now) exist twice in the DOM — desktop sidebar
  //      vs mobile sticky bar — so we skip display:none copies.
  //   2. Some elements carry multiple ids (e.g. `user-menu register` on the
  //      post-auth profile chip) so the Sign Up step can still point at an
  //      on-screen element once the Register link is gone. `~=` matches a
  //      whitespace-separated word within the attribute, like CSS class
  //      selectors.
  const findTarget = useCallback((): HTMLElement | null => {
    if (!targetId) return null;
    const nodes = document.querySelectorAll<HTMLElement>(`[data-tour-id~="${targetId}"]`);
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return n;
    }
    return nodes[0] ?? null;
  }, [targetId]);

  const measure = useCallback(() => {
    if (!targetId) { setRect(null); return; }
    const el = findTarget();
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      centerX: r.left + r.width / 2,
      stable: true,
    });
  }, [targetId, findTarget]);

  useEffect(() => {
    if (!targetId) { setRect(null); return; }
    const el = findTarget();
    if (el && "scrollIntoView" in el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Measure shortly after scrolling settles to avoid a jumpy first frame.
    const t = window.setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetId, measure, findTarget]);

  return rect;
}

/**
 * Dim the whole viewport except a rectangular cutout around the target.
 * The cutout is achieved with a single pointer-events-none div that has
 * a huge box-shadow — ring-of-shadow trick so no SVG mask is needed and
 * pointer events still reach the highlighted element.
 */
function Spotlight({ rect, onClick }: { rect: TargetRect | null; onClick: () => void }) {
  // The dim is achieved entirely with a single huge box-shadow ring around
  // a transparent cutout div. We keep this div mounted for the whole tour
  // and just move it — when there's no target we collapse it to zero size
  // at (0,0). The box-shadow (spread 9999px) then radiates from that point
  // in both directions and fills the viewport, so "no target" still
  // renders as a flat dim rather than a peek-through.
  const PAD = 10;
  const top = rect ? Math.max(0, rect.top - PAD) : 0;
  const left = rect ? Math.max(0, rect.left - PAD) : 0;
  const w = rect ? rect.width + PAD * 2 : 0;
  const h = rect ? rect.height + PAD * 2 : 0;

  return (
    <>
      {/* Click catcher — clicking outside the target dismisses the tour.
          The cutout itself is pointer-events-none so the target stays
          clickable through it. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40"
        onClick={onClick}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed z-40 rounded-xl pointer-events-none"
        style={{
          top, left, width: w, height: h,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.8)",
          // No CSS transition on the cutout's position/size: the page
          // scrolls (smoothly) to bring each new target into view, and a
          // scroll listener re-measures on every scroll event. A CSS
          // transition would restart on every measure, so the cutout
          // would lag behind the element and briefly expose undimmed
          // viewport. Without a transition, the cutout tracks exactly.
        }}
        aria-hidden="true"
      />
    </>
  );
}

function Tooltip({ rect, title, description }: { rect: TargetRect | null; title: string; description: string }) {
  if (!rect) return null;

  const tooltipWidth = 220;
  const tooltipLeft = Math.min(
    Math.max(rect.centerX - tooltipWidth / 2, 12),
    window.innerWidth - tooltipWidth - 12
  );
  const arrowOffset = rect.centerX - tooltipLeft;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="fixed z-[60]"
      style={{ top: rect.top + rect.height + 18, left: tooltipLeft, width: tooltipWidth }}
      data-testid="tour-tooltip"
    >
      {/* Arrow — positioned to point at the target element */}
      <div
        className="w-3 h-3 rotate-45 -mb-1.5 absolute"
        style={{
          backgroundColor: "#FFFFFF",
          boxShadow: "-1px -1px 2px rgba(0,0,0,0.05)",
          left: Math.max(12, Math.min(arrowOffset - 6, tooltipWidth - 18)),
        }}
      />
      <div className="bg-white rounded-xl shadow-lg border border-black/10 px-4 py-3">
        <p className="text-sm font-semibold" style={{ color: "#000000" }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: "#000000", opacity: 0.5 }}>{description}</p>
      </div>
    </motion.div>
  );
}

export function GuidedTour({ isOpen, onClose }: GuidedTourProps) {
  const { isAuthenticated, user } = useAuth();
  const { isConnected } = useAccount();
  const pathname = usePathname();
  const [currentStep, setCurrentStep] = useState(0);

  // The final "Buy Token" step points at a different element depending on
  // where the user is: the projects section on the home page, the first
  // card's "View Details" on the listing page, the Buy Now button on a
  // project detail page, and falls back to no target elsewhere.
  const steps = useMemo<TourStep[]>(() => {
    const buyTokenTargetId =
      pathname === "/" ? "first-project-card"
      : pathname === "/projects" ? "first-project-card"
      : pathname?.startsWith("/project/") ? "buy-button"
      : undefined;
    const buyTokenDescription =
      pathname === "/" ? "Check out live opportunities. Open any project, like this, to review and buy."
      : pathname === "/projects" ? "Open a project to see its terms, round, and buy option."
      : pathname?.startsWith("/project/") ? "Click Buy Now to purchase tokens with USDC or OTC."
      : "Purchase tokens via crypto or OTC bank transfer.";
    return ALL_STEPS.map((s) =>
      s.title === "Buy Token"
        ? { ...s, targetId: buyTokenTargetId, description: buyTokenDescription, doneDescription: buyTokenDescription }
        : s
    );
  }, [pathname]);

  const isStepCompleted = useCallback((step: TourStep): boolean => {
    if (!step.completedKey) return false;
    if (step.completedKey === "authenticated") return isAuthenticated;
    if (step.completedKey === "walletConnected") return isConnected;
    if (step.completedKey === "verified") return user?.kycStatus === "approved";
    return false;
  }, [isAuthenticated, isConnected, user?.kycStatus]);

  // Reset step when opened
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  // Lock USER scroll while the tour is open so the spotlight/tooltip stay
  // pinned to the target without the lag introduced by the scroll-listener
  // measure cycle. Programmatic scrolling (scrollIntoView, used to bring
  // the next step's target into view) still works because we only cancel
  // user-initiated wheel/touch/key events — not the document scroll API.
  useEffect(() => {
    if (!isOpen) return;
    const prevent = (e: Event) => e.preventDefault();
    const preventKeys = (e: KeyboardEvent) => {
      const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (keys.includes(e.key)) e.preventDefault();
    };
    window.addEventListener("wheel", prevent, { passive: false });
    window.addEventListener("touchmove", prevent, { passive: false });
    window.addEventListener("keydown", preventKeys);
    return () => {
      window.removeEventListener("wheel", prevent);
      window.removeEventListener("touchmove", prevent);
      window.removeEventListener("keydown", preventKeys);
    };
  }, [isOpen]);

  const activeStep = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  // Measure the active step's target element. Spotlight + Tooltip both
  // read this so they stay aligned as the window scrolls/resizes.
  const targetRect = useTargetRect(activeStep?.targetId);

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem("cireta_tour_completed", "true");
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleClose = () => {
    localStorage.setItem("cireta_tour_completed", "true");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Spotlight: dims the viewport everywhere except a ring around
              the active step's target element. When no target exists,
              falls back to a flat dim overlay so the page stays dimmed
              for the duration of the tour. Hidden on mobile where the
              modal is full-screen and the cutout would be confusing. */}
          <div className="hidden sm:block">
            <Spotlight rect={activeStep?.targetId ? targetRect : null} onClick={handleClose} />
          </div>
          {/* Mobile backdrop — flat dim since spotlight is off on small screens */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-40 sm:hidden"
            onClick={handleClose}
          />

          {/* Tooltip for targeted steps — hidden on mobile */}
          <div className="hidden sm:block">
            {activeStep?.targetId && (
              <Tooltip
                rect={targetRect}
                title={activeStep.title}
                description={activeStep.description}
              />
            )}
          </div>

          {/* Modal — full screen on mobile, centered card on desktop */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed z-[70] sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm sm:rounded-2xl inset-x-0 bottom-0 sm:inset-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1 rounded-lg transition-colors hover:bg-black/5"
            >
              <X className="h-4 w-4" style={{ color: "#000000", opacity: 0.4 }} />
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-6 pr-6">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#000000" }}>
                  Hey, Let&apos;s take a quick tour!
                </h2>
                <p className="text-sm mt-1" style={{ color: "#000000", opacity: 0.5 }}>
                  Discover the Cireta Launchpad in a few steps
                </p>
              </div>
              <Image src="/images/logo/cireta-icon.svg" alt="Cireta" width={28} height={28} className="w-7 h-7 shrink-0" />
            </div>

            {/* Step list */}
            <div className="space-y-0">
              {steps.map((step, i) => {
                const isActive = i === currentStep;
                const isPast = i < currentStep;
                const isDone = isStepCompleted(step);
                // Only reveal the "Complete" tick once the user has navigated
                // to or past this step — so earlier-done steps don't announce
                // themselves before the tour has acknowledged them.
                const reachedDone = isDone && (isActive || isPast);
                return (
                  <div key={step.title} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
                        style={{
                          backgroundColor: isActive || isPast ? "#13636F" : "#ECF3F4",
                          color: isActive || isPast ? "#FFFFFF" : "#000000",
                          opacity: isActive || isPast ? 1 : 0.4,
                        }}
                      >
                        <step.icon className="h-4 w-4" />
                      </div>
                      {i < steps.length - 1 && (
                        <div
                          className="w-px h-6"
                          style={{
                            borderLeft: "2px dashed",
                            borderColor: isDone || isPast ? "#13636F" : "#ECF3F4",
                          }}
                        />
                      )}
                    </div>
                    <div className="pt-1.5 pb-1">
                      <p
                        className="text-sm"
                        style={{
                          color: "#000000",
                          fontWeight: isActive ? 700 : 500,
                          opacity: reachedDone ? 0.6 : isActive ? 1 : isPast ? 0.6 : 0.35,
                        }}
                      >
                        {step.title}
                        <AnimatePresence>
                          {reachedDone && (
                            <motion.span
                              key="complete"
                              initial={{ opacity: 0, scale: 0.6, x: -4 }}
                              animate={{ opacity: 1, scale: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ type: "spring", stiffness: 500, damping: 25 }}
                              className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-darkAqua"
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                              Complete
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{
                          color: "#000000",
                          opacity: isActive ? 0.5 : 0.25,
                        }}
                      >
                        {reachedDone ? step.doneDescription : step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6">
              {/* Pagination dots */}
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full transition-all"
                    style={{
                      width: i === currentStep ? 24 : 12,
                      backgroundColor: i === currentStep ? "#13636F" : "#ECF3F4",
                    }}
                  />
                ))}
              </div>

              {/* Back + Next / Get Started */}
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="text-sm font-medium px-4 py-2 rounded-full transition-colors hover:bg-black/5"
                    style={{ color: "#000000", opacity: 0.5 }}
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-full transition-colors hover:opacity-90"
                  style={{ backgroundColor: "#13636F", color: "#FFFFFF" }}
                >
                  {isLast ? "Get Started" : "Next"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
