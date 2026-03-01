"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Wallet } from "lucide-react";
import { Button, CiretaLogo } from "@/components/atoms";
import { cn } from "@/lib/utils";

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
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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
          <div className="flex items-center gap-3">
            <Button
              variant={isScrolled ? "primary" : variant === "dark" ? "secondary" : "primary"}
              size="md"
              className="hidden sm:flex"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Connect Wallet
            </Button>

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

              <div className="mt-8">
                <Button variant="primary" size="lg" className="w-full">
                  <Wallet className="h-5 w-5 mr-2" />
                  Connect Wallet
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
