"use client";

import { useEffect, useRef, useState } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/atoms";
import { checkSaleSlug } from "@/lib/api/repositories/sales";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

interface Props {
  value: string;
  onChange: (slug: string) => void;
  // The title the slug should auto-track until the user manually edits it.
  // Once `value` diverges from `slugify(title)` we stop tracking.
  title: string;
  // When editing an existing sale, exclude its own id from the collision check.
  excludeId?: string;
  className?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken"; suggestion: string | null }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

export function SaleSlugField({ value, onChange, title, excludeId, className }: Props) {
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the title's previous slugified form so we only auto-fill when the
  // user hasn't manually edited the slug. Once they edit, we stop tracking.
  const lastTitleSlugRef = useRef("");

  useEffect(() => {
    if (touched) return;
    const derived = slugify(title);
    if (derived === lastTitleSlugRef.current) return;
    lastTitleSlugRef.current = derived;
    onChange(derived);
  }, [title, touched, onChange]);

  // Debounced availability check.
  useEffect(() => {
    if (!value) {
      setStatus({ kind: "idle" });
      return;
    }
    if (value.length < 3 || value.length > 100 || !SLUG_RE.test(value)) {
      setStatus({
        kind: "invalid",
        message:
          "Use 3–100 lowercase letters, digits or single hyphens (no leading/trailing/double hyphens).",
      });
      return;
    }
    setStatus({ kind: "checking" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await checkSaleSlug(value, excludeId);
        if (r.available) setStatus({ kind: "available" });
        else setStatus({ kind: "taken", suggestion: r.suggestion });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't verify availability",
        });
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, excludeId]);

  return (
    <div className={className}>
      <Input
        label="Sale Slug (URL)"
        placeholder="e.g., gold-reserve-seed"
        value={value}
        onChange={(e) => {
          setTouched(true);
          // Normalize as the user types — replace illegal chars with '-'.
          onChange(slugify(e.target.value).slice(0, 100));
        }}
      />
      <div className="mt-1 min-h-[20px] text-xs flex items-center gap-1.5">
        {value && (
          <span className="text-zinc-500">
            URL: <span className="font-mono">/project/{value}</span>
          </span>
        )}
        {status.kind === "checking" && (
          <span className="text-zinc-500 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking…
          </span>
        )}
        {status.kind === "available" && (
          <span className="text-green-600 inline-flex items-center gap-1">
            <Check className="w-3 h-3" /> Available
          </span>
        )}
        {status.kind === "taken" && (
          <span className="text-red-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Taken
            {status.suggestion && (
              <button
                type="button"
                className="underline ml-1"
                onClick={() => {
                  setTouched(true);
                  onChange(status.suggestion!);
                }}
              >
                use {status.suggestion}
              </button>
            )}
          </span>
        )}
        {status.kind === "invalid" && (
          <span className="text-red-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {status.message}
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-amber-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
