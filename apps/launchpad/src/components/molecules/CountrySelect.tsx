"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  COUNTRIES,
  type Country,
  type CountryMode,
  countryToMode,
  resolveCountry,
} from "@/lib/countries";

interface CountrySelectProps {
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  mode: CountryMode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // When true, accepts and shows alpha-3 input even if mode is numeric (used by the
  // platform Users page where stored value might be in a non-canonical form).
  permissive?: boolean;
}

export function CountrySelect({
  value,
  onChange,
  mode,
  placeholder = "Select country…",
  disabled,
  className = "",
  permissive = true,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    if (permissive) return resolveCountry(value);
    if (mode === "numeric" && typeof value === "number") {
      return COUNTRIES.find((c) => c.numeric === value) ?? null;
    }
    if (typeof value === "string") {
      const upper = value.toUpperCase();
      if (mode === "alpha2") return COUNTRIES.find((c) => c.alpha2 === upper) ?? null;
      if (mode === "alpha3") return COUNTRIES.find((c) => c.alpha3 === upper) ?? null;
    }
    return null;
  }, [value, mode, permissive]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.alpha2.toLowerCase().includes(q) ||
        c.alpha3.toLowerCase().includes(q) ||
        String(c.numeric).includes(q),
    );
  }, [query]);

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pickCountry = (c: Country) => {
    onChange(countryToMode(c, mode));
    setOpen(false);
    setQuery("");
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery("");
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-left
          focus:outline-none focus:border-[#13636F]
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        <span className={selected ? "text-zinc-900" : "text-zinc-400"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex items-center gap-1 text-zinc-400">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clear}
              className="p-0.5 hover:text-zinc-700 cursor-pointer"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-zinc-100">
            <input
              autoFocus
              type="text"
              placeholder="Search country…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-[#ECF3F4] border border-transparent rounded focus:outline-none focus:border-[#13636F]"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto" role="listbox">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-zinc-400 italic">No matches</li>
            )}
            {filtered.map((c) => {
              const isSelected = selected?.alpha3 === c.alpha3;
              return (
                <li
                  key={c.alpha3}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pickCountry(c)}
                  className={`
                    flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer
                    ${isSelected ? "bg-[#13636F] text-white" : "hover:bg-[#ECF3F4] text-zinc-900"}
                  `}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
