"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Menu, X, Wallet, User, Settings, LogOut, ChevronDown, ShieldCheck, ShieldAlert, Clock, Shield } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";


export interface NavbarProps {
  variant?: "dark" | "light";
}

export function Navbar({ variant = "dark" }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const textColor = variant === "dark" || isScrolled ? "text-white" : "text-text";

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 w-full duration-300 px-4 md:px-8",
          isScrolled
            ? "bg-darkBlack/90 backdrop-blur-xl py-2 shadow-nav"
            : "py-3 md:py-4",
          variant === "light" && !isScrolled && "bg-white"
        )}
      >
        <nav className="relative w-full flex items-center justify-between mx-auto max-w-inner h-full">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            {(variant === "dark" || isScrolled) ? (
              <Image src="/images/logo/cireta-logo-white.svg" alt="Cireta" width={552} height={146} className="h-8 w-auto" />
            ) : (
              <Image src="/images/logo/cireta-logo.svg" alt="Cireta" width={552} height={146} className="h-8 w-auto" />
            )}
          </Link>


          {/* Actions */}
          <div className="relative flex items-center gap-3">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                    className="hidden sm:flex"
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 hover:opacity-80",
                              isScrolled || variant === "dark"
                                ? "bg-white text-darkBlack"
                                : "bg-darkBlack text-white"
                            )}
                          >
                            <Wallet className="h-4 w-4" />
                            Connect Wallet
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold bg-red-500 text-white transition-all duration-300 hover:opacity-80"
                          >
                            Wrong Network
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={openAccountModal}
                          className={cn(
                            "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 hover:opacity-80",
                            isScrolled || variant === "dark"
                              ? "bg-darkAqua text-white"
                              : "bg-darkAqua text-white"
                          )}
                        >
                          <Wallet className="h-4 w-4" />
                          {account.displayName}
                        </button>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>

            {/* Auth CTAs — visible when not authenticated */}
            {!isAuthenticated && (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href={`/login?redirect=${encodeURIComponent(pathname)}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium border transition-all duration-300 hover:opacity-80",
                    isScrolled || variant === "dark"
                      ? "border-white/30 text-white hover:bg-white/10"
                      : "border-darkBlack/20 text-text hover:bg-darkBlack/5"
                  )}
                >
                  Sign In
                </Link>
                <Link
                  href={`/register?redirect=${encodeURIComponent(pathname)}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 hover:opacity-80",
                    isScrolled || variant === "dark"
                      ? "bg-white text-darkBlack"
                      : "bg-darkBlack text-white"
                  )}
                >
                  Register
                </Link>
              </div>
            )}

            {/* Complete Profile CTA — shown when logged in but onboarding not done */}
            {isAuthenticated && user && !user.onboarding_completed && user.kycStatus !== "approved" && (
              <Link
                href="/onboarding"
                className="hidden sm:inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white transition-all duration-300 animate-pulse"
                style={{ backgroundColor: "#13636F" }}
              >
                Complete Profile
              </Link>
            )}

            {/* User Menu */}
            {isAuthenticated && user && (
              <div className="relative hidden sm:block" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                    isScrolled || variant === "dark"
                      ? "text-white/80 hover:text-white hover:bg-white/10"
                      : "text-text/80 hover:text-text hover:bg-darkBlack/5"
                  )}
                >
                  <div className="relative w-7 h-7 rounded-full bg-darkAqua/20 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-darkAqua" />
                    {kycBadge && (
                      <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ring-2", isScrolled || variant === "dark" ? "ring-darkBlack/90" : "ring-white", kycBadge.bg)} title={kycBadge.tooltip}>
                        <kycBadge.icon className={cn("h-2 w-2", kycBadge.color)} />
                      </span>
                    )}
                  </div>
                  <span className="max-w-[120px] truncate">{user.display_name || user.email.split("@")[0]}</span>
                  {kycBadge?.label === "Verified" && (
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isUserMenuOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {isUserMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-lg border border-darkBlack/10 py-2 z-50"
                    >
                      <div className="px-4 py-3 border-b border-darkBlack/5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-text truncate">{user.display_name || user.email.split("@")[0]}</p>
                          {kycBadge && (
                            <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold", kycBadge.bg, kycBadge.color)}>
                              <kycBadge.icon className="h-2.5 w-2.5" />
                              {kycBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-darkBlack/50 truncate">{user.email}</p>
                      </div>
                      {user.kycStatus !== "approved" && (
                        <Link href="/onboarding" onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                          style={{ color: "#13636F" }}
                        >
                          <Shield className="h-4 w-4" />
                          {user.kycStatus === "none" ? "Complete Verification" : user.kycStatus === "pending" ? "Verification In Progress" : user.kycStatus === "rejected" ? "Re-submit Verification" : "Renew Verification"}
                        </Link>
                      )}
                      <Link href="/account" onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-darkBlack/5 transition-colors">
                        <User className="h-4 w-4 text-darkBlack/40" /> Account
                      </Link>
                      <Link href="/settings" onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-darkBlack/5 transition-colors">
                        <Settings className="h-4 w-4 text-darkBlack/40" /> Settings
                      </Link>
                      <div className="border-t border-darkBlack/5 mt-1 pt-1">
                        <button onClick={() => { setIsUserMenuOpen(false); logout(); }}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full">
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={cn(
                "lg:hidden p-2 rounded-full transition-colors",
                isScrolled || variant === "dark"
                  ? "text-white hover:bg-white/10"
                  : "text-text hover:bg-darkBlack/5"
              )}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </nav>
      </header>
      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-darkBlack shadow-aside p-6 pt-24">
              <nav className="flex flex-col gap-2">
                <Link href="/projects" onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-xl text-lg font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                  Explore Projects
                </Link>
              </nav>
              {/* Sign Up / Log In (Mobile) */}
              {!isAuthenticated && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <Link
                    href={`/login?redirect=${encodeURIComponent(pathname)}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-darkBlack text-base font-semibold transition-colors hover:bg-white/90"
                  >
                    <User className="h-5 w-5" />
                    Sign Up / Log In
                  </Link>
                </div>
              )}
              {/* User Info (Mobile) */}
              {isAuthenticated && user && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="px-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-white">{user.display_name || user.email.split("@")[0]}</p>
                      {kycBadge && (
                        <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold", kycBadge.bg, kycBadge.color)}>
                          <kycBadge.icon className="h-2.5 w-2.5" />
                          {kycBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50">{user.email}</p>
                  </div>
                  {!user.onboarding_completed && user.kycStatus !== "approved" && (
                    <Link href="/onboarding" onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors animate-pulse"
                      style={{ color: "#13636F" }}
                    >
                      <Shield className="h-5 w-5" />
                      Complete Profile
                    </Link>
                  )}
                  {user.onboarding_completed && user.kycStatus !== "approved" && (
                    <Link href="/verify" onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors"
                      style={{ color: "#13636F" }}
                    >
                      <Shield className="h-5 w-5" />
                      {user.kycStatus === "pending" ? "Verification In Progress" : user.kycStatus === "rejected" ? "Re-submit Verification" : "Renew Verification"}
                    </Link>
                  )}
                  <Link href="/account" onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors text-base font-medium">
                    <User className="h-5 w-5" /> Account
                  </Link>
                  <Link href="/settings" onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors text-base font-medium">
                    <Settings className="h-5 w-5" /> Settings
                  </Link>
                  <button onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-base font-medium w-full">
                    <LogOut className="h-5 w-5" /> Sign Out
                  </button>
                </div>
              )}
              <div className="mt-8">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;

                    return (
                      <div
                        {...(!ready && {
                          "aria-hidden": true,
                          style: {
                            opacity: 0,
                            pointerEvents: "none",
                            userSelect: "none",
                          },
                        })}
                        className="w-full"
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={openConnectModal}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-semibold bg-darkAqua text-white transition-all duration-300 hover:opacity-80"
                              >
                                <Wallet className="h-5 w-5" />
                                Connect Wallet
                              </button>
                            );
                          }

                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-semibold bg-red-500 text-white transition-all duration-300 hover:opacity-80"
                              >
                                Wrong Network
                              </button>
                            );
                          }

                          return (
                            <button
                              onClick={openAccountModal}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-semibold bg-darkAqua text-white transition-all duration-300 hover:opacity-80"
                            >
                              <Wallet className="h-5 w-5" />
                              {account.displayName}
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
    </>
  );
}
