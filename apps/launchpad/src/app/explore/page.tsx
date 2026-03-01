"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/atoms/Button";
import { getSales, type Sale } from "@/lib/api/repositories/sales";
import { formatCurrency } from "@/lib/utils";

function ProjectCard({ sale }: { sale: Sale }) {
  const progress =
    (parseFloat(sale.total_raised) / parseFloat(sale.hard_cap)) * 100;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div className="h-48 bg-gradient-to-br from-[var(--brand-teal)]/20 to-[var(--brand-gold)]/20" />
      <div className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-[var(--brand-teal)]/10 px-3 py-1 text-sm text-[var(--brand-teal)]">
            {sale.token.asset_type}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-sm ${
              sale.status === "active"
                ? "bg-green-100 text-green-700"
                : sale.status === "paused"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {sale.status}
          </span>
        </div>

        <h3 className="mb-2 text-xl font-semibold text-[var(--brand-dark)]">
          {sale.token.name}
        </h3>
        <p className="mb-4 text-sm text-gray-500">by {sale.issuer.name}</p>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600">Raised</span>
            <span className="font-medium text-[var(--brand-teal)]">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-[var(--brand-teal)] transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm text-gray-500">
            <span>{formatCurrency(sale.total_raised)}</span>
            <span>{formatCurrency(sale.hard_cap)}</span>
          </div>
        </div>

        <Link href={`/project/${sale.id}`}>
          <Button className="w-full">View Project</Button>
        </Link>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    "active"
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales", statusFilter],
    queryFn: () => getSales(1, 20, statusFilter),
  });

  return (
    <main className="min-h-screen bg-[var(--brand-light)]">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <svg
              width="32"
              height="32"
              viewBox="0 0 40 40"
              fill="currentColor"
              className="text-[var(--brand-teal)]"
            >
              <path d="M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z" />
            </svg>
            <span className="text-xl font-bold text-[var(--brand-dark)]">
              Cireta
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              href="/explore"
              className="font-medium text-[var(--brand-teal)]"
            >
              Explore
            </Link>
            <Link
              href="/portfolio"
              className="text-gray-600 hover:text-[var(--brand-teal)]"
            >
              Portfolio
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-[var(--brand-dark)]">
              Explore Projects
            </h1>

            <div className="flex gap-2">
              {["active", "paused", "finalized", undefined].map((status) => (
                <button
                  key={status ?? "all"}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    statusFilter === status
                      ? "bg-[var(--brand-teal)] text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {status ?? "All"}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-teal)] border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-6 text-center text-red-600">
              Failed to load projects. Please try again.
            </div>
          ) : data?.items.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-12 text-center">
              <p className="text-gray-600">No projects found.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data?.items.map((sale) => (
                <ProjectCard key={sale.id} sale={sale} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
