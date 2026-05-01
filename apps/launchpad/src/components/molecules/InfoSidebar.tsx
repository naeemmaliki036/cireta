"use client";

import React from "react";
import Link from "next/link";
import { Lightbulb, ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InfoSidebarItem {
  icon?: LucideIcon;
  title: string;
  body: React.ReactNode;
  href?: string;
  hrefLabel?: string;
}

export interface InfoSidebarProps {
  /** Optional heading shown above the list. Defaults to "Helpful tips". */
  heading?: string;
  items: InfoSidebarItem[];
  /** Optional content rendered above the tips (e.g. live data summary). */
  children?: React.ReactNode;
  className?: string;
}

export function InfoSidebar({
  heading = "Helpful tips",
  items,
  children,
  className,
}: InfoSidebarProps) {
  return (
    <aside className={cn("space-y-3 lg:sticky lg:top-20 self-start", className)}>
      {children}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-darkAqua" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-black/60">
              {heading}
            </p>
          </div>
          <ul className="divide-y divide-black/5">
            {items.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li key={idx} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {Icon && (
                      <div className="w-6 h-6 rounded-md bg-box flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="h-3 w-3 text-darkAqua" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text leading-tight">
                        {item.title}
                      </p>
                      <div className="text-xs text-black/60 leading-relaxed mt-1">
                        {item.body}
                      </div>
                      {item.href && (
                        <Link
                          href={item.href}
                          className="inline-flex items-center gap-1 text-xs font-medium text-darkAqua hover:underline mt-1.5"
                        >
                          {item.hrefLabel ?? "Learn more"}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
