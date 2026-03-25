"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Wallet, User, Settings, LogOut, ChevronDown } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CiretaLogo } from "@/components/atoms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/portfolio", label: "Portfolio" },
];

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
  const logoColor = variant === "dark" || isScrolled ? "white" : "dark";

  return (
    <>
      <header
        className={cn(
          "fixed left-0 right-0 z-50 w-full duration-300 px-4 md:px-8",
          isScrolled
            ? "bg-darkBlack/90 backdrop-blur-xl py-4 shadow-nav"
            : "py-6 md:py-8",
          variant === "light" && !isScrolled && "bg-white"
        )}
      >
        <nav className="relative w-full flex items-center justify-between mx-auto max-w-inner h-full">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <CiretaLogo variant="icon" color={isScrolled ? "teal" : logoColor} className="w-8 h-8" />
            <span
              className={cn(
                "text-xl font-bold tracking-tight hidden sm:block",
                isScrolled ? "text-white" : textColor
              )}
            >
              Cireta
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "px-4 py-2 rounded-full text-base font-medium transition-colors duration-200",
                      pathname === link.href
                        ? variant === "light" && !isScrolled
                          ? "bg-darkAqua/10 text-darkAqua font-semibold"
                          : "bg-white/20 text-white font-semibold"
                        : cn(
                            isScrolled
                              ? "text-white/70 hover:text-white hover:bg-white/10"
                              : variant === "dark"
                              ? "text-white/70 hover:text-white hover:bg-white/10"
                              : "text-text/70 hover:text-text hover:bg-darkBlack/5"
                          )
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

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
                              "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-300 hover:opacity-80",
                              isScrolled || variant === "dark"
                                ? "bg-darkAqua text-white"
                                : "bg-darkAqua text-white"
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
                  <div className="w-7 h-7 rounded-full bg-darkAqua/20 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-darkAqua" />
                  </div>
                  <span className="max-w-[120px] truncate">{user.display_name || user.email.split("@")[0]}</span>
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
                        <p className="text-sm font-semibold text-text truncate">{user.display_name || user.email.split("@")[0]}</p>
                        <p className="text-xs text-darkBlack/50 truncate">{user.email}</p>
                      </div>
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
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "px-4 py-3 rounded-xl text-lg font-medium transition-colors",
                      pathname === link.href
                        ? "bg-darkAqua/20 text-darkAqua"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              {/* User Info (Mobile) */}
              {isAuthenticated && user && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="px-4 mb-4">
                    <p className="text-sm font-semibold text-white">{user.display_name || user.email.split("@")[0]}</p>
                    <p className="text-xs text-white/50">{user.email}</p>
                  </div>
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
