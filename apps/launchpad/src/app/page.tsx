import Link from "next/link";
import { Button } from "@/components/atoms/Button";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--brand-dark)] to-[var(--brand-teal)] px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center text-center">
            {/* Logo */}
            <svg
              width="80"
              height="80"
              viewBox="0 0 40 40"
              fill="currentColor"
              className="mb-8"
            >
              <path d="M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z" />
            </svg>

            <h1 className="mb-6 text-5xl font-bold tracking-tighter md:text-7xl">
              Invest in Real-World Assets
            </h1>

            <p className="mb-10 max-w-2xl text-xl text-white/80">
              Access tokenized gold, copper, and commodity futures on Base L2.
              Fully compliant ERC-3643 security tokens with KYC verification.
            </p>

            <div className="flex gap-4">
              <Link href="/explore">
                <Button size="lg">Explore Projects</Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[var(--brand-gold)]/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[var(--brand-teal)]/20 blur-3xl" />
      </section>

      {/* How It Works */}
      <section className="bg-[var(--brand-light)] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-[var(--brand-dark)]">
            How It Works
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Complete KYC",
                description:
                  "Verify your identity through our secure KYC process to ensure compliance.",
              },
              {
                step: "02",
                title: "Browse Projects",
                description:
                  "Explore tokenized real-world assets from verified issuers.",
              },
              {
                step: "03",
                title: "Invest",
                description:
                  "Contribute USDC to receive security tokens representing your ownership.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl bg-white p-8 shadow-sm"
              >
                <span className="mb-4 inline-block text-4xl font-bold text-[var(--brand-gold)]">
                  {item.step}
                </span>
                <h3 className="mb-3 text-xl font-semibold text-[var(--brand-dark)]">
                  {item.title}
                </h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center justify-between">
            <h2 className="text-3xl font-bold text-[var(--brand-dark)]">
              Live Projects
            </h2>
            <Link href="/explore">
              <Button variant="ghost">View All</Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Placeholder project cards */}
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div className="h-48 bg-gradient-to-br from-[var(--brand-teal)]/20 to-[var(--brand-gold)]/20" />
                <div className="p-6">
                  <span className="mb-2 inline-block rounded-full bg-[var(--brand-teal)]/10 px-3 py-1 text-sm text-[var(--brand-teal)]">
                    Commodities
                  </span>
                  <h3 className="mb-2 text-xl font-semibold">
                    Gold Reserve Token #{i}
                  </h3>
                  <p className="mb-4 text-sm text-gray-600">
                    Tokenized gold reserves backed by physical bullion
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Raised</p>
                      <p className="font-semibold text-[var(--brand-teal)]">
                        $1.2M / $5M
                      </p>
                    </div>
                    <Button size="sm">View</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
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
            </div>
            <nav className="flex gap-8">
              <Link
                href="/explore"
                className="text-gray-600 hover:text-[var(--brand-teal)]"
              >
                Explore
              </Link>
              <Link
                href="/about"
                className="text-gray-600 hover:text-[var(--brand-teal)]"
              >
                About
              </Link>
              <Link
                href="/docs"
                className="text-gray-600 hover:text-[var(--brand-teal)]"
              >
                Documentation
              </Link>
            </nav>
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Cireta. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
