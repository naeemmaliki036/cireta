"use client";

import { useState } from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="More info"
        className="inline-flex items-center justify-center text-zinc-400 hover:text-darkAqua"
        onClick={(e) => {
          e.preventDefault();
          setOpen((s) => !s);
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-64 rounded-md bg-zinc-900 text-white text-[11px] leading-snug px-3 py-2 shadow-lg pointer-events-none"
        >
          {text}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-zinc-900 rotate-45 -mt-1" />
        </span>
      ) : null}
    </span>
  );
}
