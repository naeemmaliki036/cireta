"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu, X, Wallet, User, Settings, LogOut, ChevronDown, Briefcase,
  ShieldCheck, ShieldAlert, Clock, Shield,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { GuidedTour } from "./GuidedTour";

/* ─── Nav icon SVGs ─── */
const navIcons = {
  insights: (
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M3 17V7l4-4h6l4 4v10H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 12h6M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  faqs: (
    <svg viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.5a2 2 0 113 1.7c-.5.4-1 .8-1 1.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
    </svg>
  ),
  contact: (
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M3 5h14v10H3V5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 5l7 6 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  quickTour: (
    <svg viewBox="0 0 20 20" fill="none">
      <polygon points="6,4 6,16 16,10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.5" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 16c0-2 1.5-3.5 3.5-3.5s2 1.5 2 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

/* ─── Nav groups data (matches cireta.com + added Learn) ─── */
interface NavItem {
  key: string;
  title: string;
  desc: string;
  href: string;
  external?: boolean;
  icon: React.ReactNode;
  action?: "tour";
}
interface NavGroup {
  key: string;
  label: string;
  type: "link" | "dropdown";
  href?: string;
  children?: NavItem[];
}

const CIRETA = "https://www.cireta.com";

const navGroupsData: NavGroup[] = [
  { key: "home", label: "Home", type: "link", href: "/" },
  { key: "projects", label: "Projects", type: "link", href: "/projects" },
  {
    key: "company",
    label: "Company",
    type: "dropdown",
    children: [
      { key: "about", title: "About Us", desc: "Our mission, values, and the team behind Cireta.", href: `${CIRETA}/about`, external: true, icon: navIcons.about },
      { key: "team", title: "Team", desc: "Meet our leadership and advisory board.", href: `${CIRETA}/team`, external: true, icon: navIcons.team },
      { key: "contact", title: "Contact Us", desc: "Reach out for support or partnership inquiries.", href: `${CIRETA}/contact-us`, external: true, icon: navIcons.contact },
    ],
  },
  {
    key: "learn",
    label: "Learn",
    type: "dropdown",
    children: [
      { key: "tour", title: "Quick Tour", desc: "Take a guided tour", href: "#", action: "tour", icon: navIcons.quickTour },
      { key: "getting-started", title: "Getting Started", desc: "How the platform works", href: "/#how-it-works", icon: navIcons.insights },
      { key: "faq", title: "FAQ", desc: "Common questions", href: `${CIRETA}/faqs`, external: true, icon: navIcons.faqs },
      { key: "contact-support", title: "Contact Support", desc: "Get help from our team", href: `${CIRETA}/contact`, external: true, icon: navIcons.contact },
    ],
  },
];

const dropdownVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.95, filter: "blur(4px)", transition: { duration: 0.15 } },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -10, scale: 0.97, filter: "blur(2px)", transition: { duration: 0.18 } },
};

export interface NavbarProps {
  variant?: "dark" | "light";
}

export function Navbar({ variant = "dark" }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const dropdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navWidth, setNavWidth] = useState(0);

  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  // Small transient "Sign in to connect" hint shown when a guest taps the
  // Connect Wallet button. Auto-dismisses a few seconds later so the nav
  // doesn't stay cluttered if the user never acts on it.
  const [walletHint, setWalletHint] = useState(false);
  useEffect(() => {
    if (!walletHint) return;
    const t = window.setTimeout(() => setWalletHint(false), 4000);
    return () => window.clearTimeout(t);
  }, [walletHint]);

  // Pill state only when user has scrolled.
  const effectiveScrolled = isScrolled;
  // Text color class at the top of the page (before scroll). White on dark hero, black on light pages.
  const topTextColor = variant === "dark" ? "text-white" : "text-black";

  const kycBadge = (() => {
    if (!user) return null;
    switch (user.kycStatus) {
      case "approved":
        return { icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50", label: "Verified", tooltip: "Identity verified" };
      case "pending":
        return { icon: Clock, color: "text-amber-500", bg: "bg-amber-50", label: "Pending Review", tooltip: "Verification in progress" };
      case "rejected":
        return { icon: ShieldAlert, color: "text-red-500", bg: "bg-red-50", label: "Rejected", tooltip: "Verification rejected" };
      case "expired":
        return { icon: ShieldAlert, color: "text-orange-500", bg: "bg-orange-50", label: "Expired", tooltip: "Verification expired" };
      default:
        return null;
    }
  })();

  // Scroll listener
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Measure nav list width (used to size dropdown panel)
  useEffect(() => {
    const measure = () => {
      if (navListRef.current) setNavWidth(navListRef.current.offsetWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [effectiveScrolled]);

  // Close dropdowns on route change
  useEffect(() => {
    setActiveDropdown(null);
    setIsUserMenuOpen(false);
  }, [pathname]);

  // Escape closes dropdowns
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
      const inNav = navRef.current?.contains(target);
      const inPanel = dropdownPanelRef.current?.contains(target);
      if (activeDropdown && !inNav && !inPanel) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeDropdown]);

  // Auto-show tour for unregistered users
  useEffect(() => {
    if (typeof window !== "undefined" && !isAuthenticated && !localStorage.getItem("cireta_tour_completed")) {
      const timer = setTimeout(() => setShowTour(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Body overflow when mobile menu open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const handleMouseEnter = useCallback((groupKey: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setActiveDropdown(groupKey);
  }, []);

  const handleMouseLeave = useCallback(() => {
    dropdownTimeoutRef.current = setTimeout(() => setActiveDropdown(null), 150);
  }, []);

  const handleGroupToggle = useCallback((groupKey: string) => {
    setActiveDropdown((prev) => (prev === groupKey ? null : groupKey));
  }, []);

  const getLabelClass = (isOpen: boolean) => {
    if (effectiveScrolled) {
      return isOpen ? "text-darkAqua bg-box" : "text-black hover:text-darkAqua hover:bg-box/50";
    }
    if (topTextColor === "text-white") {
      return isOpen ? "text-white bg-white/20" : "text-white hover:bg-white/10";
    }
    return isOpen ? "text-darkAqua bg-box" : "text-black/70 hover:text-black hover:bg-box/50";
  };

  const getChevronClass = () => {
    if (effectiveScrolled) return "text-black/40";
    return topTextColor === "text-white" ? "text-white/80" : "text-black/40";
  };

  const handleLearnItemClick = (item: NavItem) => {
    if (item.action === "tour") {
      setShowTour(true);
    }
    setActiveDropdown(null);
  };

  return (
    <>
      <motion.header
        ref={navRef}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed left-0 right-0 z-[60] w-full duration-300",
          effectiveScrolled ? "px-4 md:px-8 top-3 md:top-4" : variant === "dark" ? "px-4 md:px-8 top-0" : "px-0 top-0",
        )}
      >
        <nav
          className={cn(
            "relative flex items-center justify-between mx-auto h-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            effectiveScrolled
              ? "max-w-[900px] bg-white/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] rounded-full px-4 md:px-6 py-2.5"
              : variant === "dark"
                ? "max-w-inner py-5 md:py-7"
                : "max-w-full bg-white px-6 md:px-10 py-3 border-b border-black/5"
          )}
          aria-label="Main navigation"
        >
          {/* Logo */}
          <Link
            href="/"
            aria-label="Cireta Home"
            className={cn(
              "flex items-center shrink-0 duration-300",
              effectiveScrolled
                ? "max-w-[90px] lg:max-w-[100px]"
                : variant === "dark"
                  ? "max-w-[100px] lg:max-w-[120px]"
                  : ""
            )}
          >
            {variant === "dark" && !effectiveScrolled ? (
              <Image src="/images/logo/cireta-logo-white.svg" alt="Cireta" width={552} height={146} className="w-full h-auto" priority />
            ) : (
              <Image src="/images/logo/cireta-logo.svg" alt="Cireta" width={552} height={146} className={cn(effectiveScrolled || variant === "dark" ? "w-full h-auto" : "h-8 w-auto")} priority />
            )}
          </Link>

          {/* Center Nav — desktop only */}
          <ul
            ref={navListRef}
            className={cn(
              "hidden laptop:flex items-center duration-300",
              effectiveScrolled ? "gap-0" : "gap-0.5"
            )}
            onMouseLeave={handleMouseLeave}
          >
            {navGroupsData.map((group) => {
              const isOpen = activeDropdown === group.key;
              if (group.type === "link") {
                const isActive = group.href === "/" ? pathname === "/" : !!(group.href && pathname.startsWith(group.href));
                return (
                  <li key={group.key} className="relative" onMouseEnter={() => handleMouseEnter("")}>
                    <Link
                      href={group.href || "/"}
                      className={cn(
                        "flex items-center rounded-full font-medium transition-all duration-200 whitespace-nowrap",
                        effectiveScrolled ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-xsm",
                        getLabelClass(isActive)
                      )}
                    >
                      {group.label}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={group.key} className="relative" onMouseEnter={() => handleMouseEnter(group.key)}>
                  <button
                    onClick={() => handleGroupToggle(group.key)}
                    className={cn(
                      "flex items-center gap-1 rounded-full font-medium transition-all duration-200 whitespace-nowrap",
                      effectiveScrolled ? "px-2.5 py-1.5 text-[13px]" : "px-3 py-2 text-xsm",
                      getLabelClass(isOpen)
                    )}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                  >
                    {group.label}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      className={cn("transition-transform duration-200", getChevronClass(), isOpen && "rotate-180")}
                    >
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right actions */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Connect Wallet — available to everyone. For guests, the
                connection is purely client-side (wagmi state only); SIWE
                ownership-link to a Cireta account happens only after they
                sign in and hit the wallet-link flow. */}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div
                    {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })}
                    className="hidden sm:flex"
                  >
                    {(() => {
                      if (!connected) {
                        // Wallet connection is gated behind sign-in so a user
                        // can never sign an on-chain tx without first having a
                        // Cireta account to link it to. Guests see the same
                        // "Connect Wallet" label; tapping it pops a small
                        // transient hint pointing them at the Sign In flow.
                        const connectClasses = cn(
                          "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-all duration-300 hover:opacity-80",
                          effectiveScrolled
                            ? "px-3 py-1.5 text-[13px] bg-darkAqua text-white"
                            : variant === "light"
                              ? "px-5 py-2 text-sm btn-cta"
                              : "px-5 py-2 text-sm bg-white text-black"
                        );
                        const icon = <Wallet className={effectiveScrolled ? "h-3.5 w-3.5" : "h-4 w-4"} />;
                        return (
                          <div className="relative">
                            <button
                              data-tour-id="connect-wallet"
                              onClick={() => {
                                if (isAuthenticated) openConnectModal();
                                else setWalletHint(true);
                              }}
                              className={connectClasses}
                            >
                              {icon}
                              Connect Wallet
                            </button>
                            <AnimatePresence>
                              {!isAuthenticated && walletHint && (
                                <motion.div
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -4 }}
                                  className="absolute right-0 mt-2 z-50 w-56 rounded-xl border border-black/10 bg-white shadow-lg p-3 text-xs text-black"
                                >
                                  Sign in to connect your wallet.
                                  <Link
                                    href={`/login?redirect=${encodeURIComponent(pathname)}`}
                                    className="block mt-2 text-darkAqua font-medium hover:underline"
                                    onClick={() => setWalletHint(false)}
                                  >
                                    Sign in →
                                  </Link>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }
                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-xsm font-semibold bg-red-500 text-white hover:opacity-90"
                          >
                            Wrong Network
                          </button>
                        );
                      }
                      return (
                        <button
                          data-tour-id="connect-wallet"
                          onClick={openAccountModal}
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200",
                            effectiveScrolled
                              ? "bg-box text-black hover:bg-box/80"
                              : variant === "light"
                                ? "bg-black/5 text-text hover:bg-black/10"
                                : "bg-white/10 text-white hover:bg-white/20"
                          )}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          {account.displayName}
                        </button>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>

            {/* Auth CTAs */}
            {!isAuthenticated && (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href={`/login?redirect=${encodeURIComponent(pathname)}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full font-medium border transition-all duration-300 hover:opacity-80",
                    effectiveScrolled
                      ? "h-8 md:h-9 px-4 text-[13px] border-black/15 text-black hover:bg-black/5"
                      : variant === "light"
                        ? "px-5 py-2 text-sm border-black/20 text-text hover:bg-black/5"
                        : "px-5 py-2 text-sm border-white/30 text-white hover:bg-white/10"
                  )}
                >
                  Sign In
                </Link>
                <Link
                  data-tour-id="register"
                  href={`/register?redirect=${encodeURIComponent(pathname)}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full font-semibold transition-all duration-300 hover:opacity-80",
                    effectiveScrolled
                      ? "h-8 md:h-9 px-4 text-[13px] bg-darkAqua text-white"
                      : variant === "light"
                        ? "px-5 py-2 text-sm btn-cta"
                        : "px-5 py-2 text-sm bg-white text-black"
                  )}
                >
                  Register
                </Link>
              </div>
            )}

            {/* Profile / verification CTA. While KYC/KYB is under review
                we swap the urgent "Complete Profile" pulse for a calmer
                "Verification In Review" pill that deep-links to the
                Sumsub widget page (which renders the live status). */}
            {isAuthenticated && user && !user.onboarding_completed && user.kycStatus === "pending" && (
              <Link
                href={user.investor_type === "corporate" ? "/verify/corporate" : "/verify"}
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 rounded-full font-semibold transition-all duration-300 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                  effectiveScrolled ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-[13px]"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                {user.investor_type === "corporate" ? "KYB In Review" : "KYC In Review"}
              </Link>
            )}
            {isAuthenticated && user && !user.onboarding_completed && user.kycStatus !== "approved" && user.kycStatus !== "pending" && (
              <Link
                href="/onboarding"
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 rounded-full font-semibold text-white transition-all duration-300 animate-pulse bg-darkAqua",
                  effectiveScrolled ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-[13px]"
                )}
              >
                Complete Profile
              </Link>
            )}

            {/* User Menu */}
            {isAuthenticated && user && (
              <div className="relative hidden sm:block" ref={userMenuRef}>
                <button
                  data-tour-id="user-menu register"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-all duration-200",
                    effectiveScrolled
                      ? "text-[13px] text-black/80 hover:text-black hover:bg-black/5"
                      : variant === "light"
                        ? "text-sm text-text/80 hover:text-text hover:bg-black/5"
                        : "text-sm text-white bg-white/10 hover:bg-white/20"
                  )}
                >
                  <div className={cn("relative w-6 h-6 rounded-full flex items-center justify-center", effectiveScrolled || variant === "light" ? "bg-darkAqua/10" : "bg-white/20")}>
                    <User className={cn("h-3 w-3", effectiveScrolled || variant === "light" ? "text-darkAqua" : "text-white/70")} />
                    {kycBadge && (
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ring-2",
                          effectiveScrolled || variant === "light" ? "ring-white" : "ring-black/90",
                          kycBadge.bg
                        )}
                        title={kycBadge.tooltip}
                      >
                        <kycBadge.icon className={cn("h-2 w-2", kycBadge.color)} />
                      </span>
                    )}
                  </div>
                  <span className="max-w-[120px] truncate">{user.display_name || user.email.split("@")[0]}</span>
                  {kycBadge?.label === "Verified" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isUserMenuOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {isUserMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lg border border-black/10 py-2 z-50"
                    >
                      <div className="px-4 py-3 border-b border-black/5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-black truncate">{user.display_name || user.email.split("@")[0]}</p>
                          {kycBadge && (
                            <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold", kycBadge.bg, kycBadge.color)}>
                              <kycBadge.icon className="h-2.5 w-2.5" />
                              {kycBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-black/50 truncate">{user.email}</p>
                      </div>
                      {user.kycStatus !== "approved" && (
                        <Link
                          href="/onboarding"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-darkAqua"
                        >
                          <Shield className="h-4 w-4" />
                          {user.kycStatus === "none" ? "Complete Verification" : user.kycStatus === "pending" ? "Verification In Progress" : user.kycStatus === "rejected" ? "Re-submit Verification" : "Renew Verification"}
                        </Link>
                      )}
                      <Link
                        href="/account"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-black hover:bg-black/5 transition-colors"
                      >
                        <User className="h-4 w-4 text-black/40" /> Account
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-black hover:bg-black/5 transition-colors"
                      >
                        <Settings className="h-4 w-4 text-black/40" /> Settings
                      </Link>
                      <div className="border-t border-black/5 mt-1 pt-1">
                        <button
                          onClick={() => { setIsUserMenuOpen(false); logout(); }}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full"
                        >
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            {!isMobileMenuOpen && (
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open menu"
                className={cn(
                  "laptop:hidden p-3 rounded-full transition-colors",
                  effectiveScrolled
                    ? "text-black hover:bg-black/5"
                    : variant === "dark"
                      ? "text-white hover:bg-white/10"
                      : "text-text hover:bg-black/5"
                )}
              >
                <Menu className="h-6 w-6" />
              </button>
            )}
          </div>
        </nav>
      </motion.header>

      {/* Dropdown Panel — rendered outside the pill so it can be wider */}
      <AnimatePresence>
        {activeDropdown && (
          <motion.div
            ref={dropdownPanelRef}
            key={activeDropdown}
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="hidden laptop:block fixed left-0 right-0 z-[55] pointer-events-none"
            style={{ top: effectiveScrolled ? "72px" : "80px" }}
          >
            <div className="flex justify-center px-4">
              <div
                className="pointer-events-auto bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-black/10 overflow-hidden"
                style={{ width: `${Math.max(Math.round(navWidth * 1.8), 620)}px` }}
                onMouseEnter={() => {
                  if (dropdownTimeoutRef.current) {
                    clearTimeout(dropdownTimeoutRef.current);
                    dropdownTimeoutRef.current = null;
                  }
                }}
                onMouseLeave={handleMouseLeave}
              >
                <div className="flex">
                  {/* Links */}
                  <div className="flex-1 p-4">
                    <p className="text-[11px] font-semibold text-black/40 uppercase tracking-wider mb-2 px-2">
                      {navGroupsData.find((g) => g.key === activeDropdown)?.label}
                    </p>
                    <div className="grid gap-0.5">
                      {(navGroupsData.find((g) => g.key === activeDropdown)?.children || []).map((child, i) => {
                        const linkClass = "flex items-start gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150 group hover:bg-box/60";
                        const iconEl = (
                          <span className="flex-shrink-0 mt-0.5 w-4 h-4 text-black/30 group-hover:text-darkAqua transition-colors">
                            {child.icon}
                          </span>
                        );
                        const textEl = (
                          <div className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-black group-hover:text-darkAqua transition-colors whitespace-nowrap">{child.title}</span>
                            <span className="block text-[11px] text-black/50 mt-0.5 leading-relaxed">{child.desc}</span>
                          </div>
                        );
                        const inner = (
                          <>
                            {iconEl}
                            {textEl}
                          </>
                        );
                        return (
                          <motion.div
                            key={child.key}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
                          >
                            {child.action === "tour" ? (
                              <button onClick={() => handleLearnItemClick(child)} className={cn(linkClass, "w-full text-left")}>{inner}</button>
                            ) : child.external ? (
                              <a href={child.href} target="_blank" rel="noopener noreferrer" onClick={() => setActiveDropdown(null)} className={linkClass}>{inner}</a>
                            ) : (
                              <Link href={child.href} onClick={() => setActiveDropdown(null)} className={linkClass}>{inner}</Link>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Animated decorative panel */}
                  <div className="hidden md:flex w-[260px] p-3 items-center justify-center bg-white">
                    <div className="relative w-full h-full overflow-hidden rounded-xl bg-darkAqua min-h-[220px]">
                      {/* Ambient glow */}
                      <motion.div
                        className="absolute w-36 h-36 rounded-full blur-3xl"
                        style={{ background: "radial-gradient(circle, rgba(236,243,244,0.7) 0%, transparent 70%)", top: "15%", left: "15%" }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.div
                        className="absolute w-24 h-24 rounded-full blur-2xl"
                        style={{ background: "radial-gradient(circle, rgba(236,243,244,0.75) 0%, transparent 70%)", bottom: "10%", right: "10%" }}
                        animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.85, 0.5] }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      />

                      {/* Company: connected people network */}
                      {activeDropdown === "company" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="absolute inset-0 w-full h-full" fill="none">
                            <motion.line x1="50%" y1="38%" x2="30%" y2="22%" stroke="rgba(236,243,244,0.35)" strokeWidth="1"
                              animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
                            <motion.line x1="50%" y1="38%" x2="72%" y2="25%" stroke="rgba(236,243,244,0.35)" strokeWidth="1"
                              animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }} />
                            <motion.line x1="50%" y1="38%" x2="25%" y2="60%" stroke="rgba(236,243,244,0.35)" strokeWidth="1"
                              animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.6 }} />
                            <motion.line x1="50%" y1="38%" x2="75%" y2="62%" stroke="rgba(236,243,244,0.35)" strokeWidth="1"
                              animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.9 }} />
                            <motion.line x1="50%" y1="38%" x2="50%" y2="78%" stroke="rgba(236,243,244,0.35)" strokeWidth="1"
                              animate={{ opacity: [0.3, 0.65, 0.3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.2 }} />
                          </svg>
                          <motion.div
                            className="absolute flex items-center justify-center"
                            style={{ top: "33%", left: "45%" }}
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <div className="w-7 h-7 rounded-full border-[1.5px] border-box/25 bg-box/10 flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-box/30" />
                            </div>
                            <motion.div className="absolute w-7 h-7 rounded-full border border-box/15"
                              animate={{ scale: [1, 2.2], opacity: [0.3, 0] }}
                              transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }} />
                          </motion.div>
                          {[
                            { top: "17%", left: "24%", delay: 0 },
                            { top: "20%", left: "66%", delay: 0.4 },
                            { top: "55%", left: "18%", delay: 0.8 },
                            { top: "58%", left: "68%", delay: 1.2 },
                            { top: "73%", left: "44%", delay: 0.6 },
                          ].map((node, i) => (
                            <motion.div
                              key={i}
                              className="absolute"
                              style={{ top: node.top, left: node.left }}
                              animate={{ y: [-2, 3, -2], opacity: [0.6, 0.95, 0.6] }}
                              transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: node.delay }}
                            >
                              <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
                                <circle cx="8" cy="5" r="3.5" stroke="rgba(236,243,244,0.75)" strokeWidth="1" fill="rgba(236,243,244,0.75)" />
                                <path d="M2 17C2 13.5 4.5 11 8 11C11.5 11 14 13.5 14 17" stroke="rgba(236,243,244,0.75)" strokeWidth="1" fill="rgba(236,243,244,0.18)" />
                              </svg>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Learn: token blocks rising from asset */}
                      {activeDropdown === "learn" && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "400px" }}>
                          <motion.svg
                            className="absolute bottom-[18%]" width="50" height="32" viewBox="0 0 50 32" fill="none"
                            animate={{ opacity: [0.5, 0.85, 0.5] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <rect x="5" y="8" width="16" height="24" rx="1" stroke="rgba(236,243,244,0.75)" strokeWidth="1" fill="rgba(236,243,244,0.18)" />
                            <rect x="29" y="0" width="16" height="32" rx="1" stroke="rgba(236,243,244,0.75)" strokeWidth="1" fill="rgba(236,243,244,0.18)" />
                            <rect x="9" y="12" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="14" y="12" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="9" y="18" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="14" y="18" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="33" y="5" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="38" y="5" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="33" y="11" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                            <rect x="38" y="11" width="3" height="3" rx="0.5" fill="rgba(236,243,244,0.35)" />
                          </motion.svg>
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="absolute w-8 h-8 rounded overflow-hidden"
                              style={{
                                background: `linear-gradient(135deg, rgba(236,243,244,${0.12 + i * 0.04}) 0%, rgba(236,243,244,0.35) 100%)`,
                                border: `1px solid rgba(236,243,244,${0.12 + i * 0.03})`,
                                boxShadow: i === 2 ? "0 8px 24px rgba(0,0,0,0.2)" : "none",
                              }}
                              animate={{
                                y: [20, -10 - i * 12, -10 - i * 12, 20],
                                x: [-10 + i * 14, -10 + i * 14, -10 + i * 14, -10 + i * 14],
                                opacity: [0, 1, 1, 0],
                                scale: [0.6, 1, 1, 0.6],
                              }}
                              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.6, times: [0, 0.3, 0.7, 1] }}
                            >
                              <svg className="w-full h-full p-1.5" viewBox="0 0 16 16" fill="none">
                                <rect x="2" y="2" width="5" height="5" rx="1" stroke="rgba(236,243,244,0.65)" strokeWidth="0.8" />
                                <rect x="9" y="9" width="5" height="5" rx="1" stroke="rgba(236,243,244,0.65)" strokeWidth="0.8" />
                                <path d="M7 7L9 9" stroke="rgba(236,243,244,0.75)" strokeWidth="0.8" />
                              </svg>
                            </motion.div>
                          ))}
                          <motion.div
                            className="absolute w-[1px] h-8 left-1/2"
                            style={{ background: "linear-gradient(to top, rgba(236,243,244,0.65), transparent)", bottom: "42%" }}
                            animate={{ opacity: [0.6, 0.95, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          />
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[70] laptop:hidden"
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-full shadow-2xl px-5 pt-4 pb-6 backdrop-blur-xl overflow-y-auto flex flex-col" style={{ backgroundColor: "rgba(236, 243, 244, 0.96)" }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                  <Image src="/images/logo/cireta-logo.svg" alt="Cireta" width={552} height={146} className="h-7 w-auto" />
                </Link>
                <button onClick={() => setIsMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-darkAqua text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* User profile card — if logged in */}
              {isAuthenticated && user && (
                <div className="bg-white rounded-xl p-4 mb-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-darkAqua/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-darkAqua" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-black truncate">{user.display_name || user.email.split("@")[0]}</p>
                      {kycBadge && (
                        <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0", kycBadge.bg, kycBadge.color)}>
                          <kycBadge.icon className="h-2 w-2" />
                          {kycBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-black/40 truncate">{user.email}</p>
                  </div>
                </div>
              )}

              {/* Nav groups as accordions */}
              <div className="space-y-0.5 mb-5">
                {navGroupsData.map((group) => {
                  const isOpen = mobileGroupOpen === group.key;
                  if (group.type === "link") {
                    return (
                      <Link
                        key={group.key}
                        href={group.href || "/"}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center w-full py-2.5 text-[14px] font-semibold text-black"
                      >
                        {group.label}
                      </Link>
                    );
                  }
                  return (
                    <div key={group.key}>
                      <button
                        onClick={() => setMobileGroupOpen(isOpen ? null : group.key)}
                        className="flex items-center justify-between w-full py-2.5 text-[14px] font-semibold text-black"
                      >
                        {group.label}
                        <ChevronDown className={cn("h-4 w-4 transition-transform text-black/40", isOpen && "rotate-180")} />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pl-3 pb-2 space-y-0.5">
                              {(group.children || []).map((child) => {
                                const commonClass = "flex items-center gap-2.5 py-2 text-[13px] font-medium text-black/60 hover:text-darkAqua";
                                const iconEl = <span className="w-4 h-4 text-darkAqua/60">{child.icon}</span>;
                                if (child.action === "tour") {
                                  return (
                                    <button
                                      key={child.key}
                                      onClick={() => { setIsMobileMenuOpen(false); setTimeout(() => setShowTour(true), 300); }}
                                      className={cn(commonClass, "w-full text-left")}
                                    >
                                      {iconEl} {child.title}
                                    </button>
                                  );
                                }
                                if (child.external) {
                                  return (
                                    <a key={child.key} href={child.href} target="_blank" rel="noopener noreferrer" onClick={() => setIsMobileMenuOpen(false)} className={commonClass}>
                                      {iconEl} {child.title}
                                    </a>
                                  );
                                }
                                return (
                                  <Link key={child.key} href={child.href} onClick={() => setIsMobileMenuOpen(false)} className={commonClass}>
                                    {iconEl} {child.title}
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Account links — if logged in */}
              {isAuthenticated && user ? (
                <div className="border-t border-black/5 pt-4 space-y-0.5">
                  {!user.onboarding_completed && user.kycStatus === "pending" && (
                    <Link
                      href={user.investor_type === "corporate" ? "/verify/corporate" : "/verify"}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 py-2.5 text-[13px] font-semibold text-amber-700"
                    >
                      <Clock className="h-4 w-4" /> {user.investor_type === "corporate" ? "KYB In Review" : "KYC In Review"}
                    </Link>
                  )}
                  {!user.onboarding_completed && user.kycStatus !== "approved" && user.kycStatus !== "pending" && (
                    <Link href="/onboarding" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 py-2.5 text-[13px] font-semibold text-darkAqua">
                      <Shield className="h-4 w-4" /> Complete Profile
                    </Link>
                  )}
                  <Link href="/portfolio" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 py-2.5 text-[14px] font-medium text-black">
                    <Briefcase className="h-4 w-4 text-black/30" /> Portfolio
                  </Link>
                  <Link href="/account" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 py-2.5 text-[14px] font-medium text-black">
                    <User className="h-4 w-4 text-black/30" /> Account
                  </Link>
                  <Link href="/settings" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 py-2.5 text-[14px] font-medium text-black">
                    <Settings className="h-4 w-4 text-black/30" /> Settings
                  </Link>
                </div>
              ) : (
                <div className="border-t border-black/5 pt-4">
                  <Link
                    href={`/login?redirect=${encodeURIComponent(pathname)}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-darkAqua"
                  >
                    Sign Up / Log In
                  </Link>
                </div>
              )}

              {/* Bottom actions — pushed to bottom */}
              <div className="mt-auto pt-4 space-y-3">
                {/* Sign Out */}
                {isAuthenticated && (
                  <button onClick={() => { setIsMobileMenuOpen(false); logout(); }} className="flex items-center gap-2 text-[13px] text-black/30 hover:text-black/50 transition-colors w-full">
                    <LogOut className="h-3.5 w-3.5" /> Sign Out
                  </button>
                )}
                {/* Connect Wallet — available to guests too */}
                <ConnectButton.Custom>
                  {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;
                    return (
                      <div {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })} className="w-full">
                        {(() => {
                          if (!connected) {
                            return (
                              <div className="w-full">
                                <button
                                  onClick={() => {
                                    if (isAuthenticated) openConnectModal();
                                    else setWalletHint(true);
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-darkAqua/30 text-darkAqua hover:bg-darkAqua/5 transition-colors"
                                >
                                  <Wallet className="h-4 w-4" /> Connect Wallet
                                </button>
                                {!isAuthenticated && walletHint && (
                                  <div className="mt-2 rounded-xl border border-black/10 bg-white p-3 text-xs text-black">
                                    Sign in to connect your wallet.
                                    <Link
                                      href={`/login?redirect=${encodeURIComponent(pathname)}`}
                                      className="block mt-2 text-darkAqua font-medium hover:underline"
                                      onClick={() => setWalletHint(false)}
                                    >
                                      Sign in →
                                    </Link>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (chain.unsupported) {
                            return (
                              <button onClick={openChainModal} className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-red-500 text-white">
                                Wrong Network
                              </button>
                            );
                          }
                          return (
                            <button onClick={openAccountModal} className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-darkAqua/30 text-darkAqua">
                              <Wallet className="h-4 w-4" /> {account.displayName}
                            </button>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <GuidedTour
        isOpen={showTour}
        onClose={() => {
          setShowTour(false);
          localStorage.setItem("cireta_tour_completed", "true");
        }}
      />
    </>
  );
}
