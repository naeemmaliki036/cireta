import Link from "next/link";

export default function AdminDashboard() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-gray-200 bg-white p-6">
        <div className="mb-8 flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="currentColor" className="text-[var(--brand-teal)]">
            <path d="M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z" />
          </svg>
          <span className="text-xl font-bold text-[var(--brand-dark)]">Cireta Admin</span>
        </div>

        <nav className="space-y-1">
          {[
            { href: "/", label: "Dashboard", active: true },
            { href: "/tokens", label: "Tokens" },
            { href: "/sales", label: "Token Sales" },
            { href: "/investors", label: "Investors" },
            { href: "/compliance", label: "Compliance" },
            { href: "/settings", label: "Settings" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                item.active
                  ? "bg-[var(--brand-teal)] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="ml-64 p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--brand-dark)]">Dashboard</h1>
          <p className="text-gray-600">Welcome to the Cireta Admin Portal</p>
        </header>

        {/* Stats */}
        <div className="mb-8 grid gap-6 md:grid-cols-4">
          {[
            { label: "Total Tokens", value: "12", change: "+2 this month" },
            { label: "Active Sales", value: "4", change: "$2.4M raised" },
            { label: "Investors", value: "1,247", change: "+89 this week" },
            { label: "Total Volume", value: "$8.2M", change: "+12%" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-3xl font-bold text-[var(--brand-dark)]">{stat.value}</p>
              <p className="text-sm text-[var(--brand-teal)]">{stat.change}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-[var(--brand-dark)]">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/tokens/new" className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center hover:border-[var(--brand-teal)] hover:bg-gray-50">
              <p className="font-medium text-[var(--brand-dark)]">Create Token</p>
              <p className="text-sm text-gray-500">Deploy a new ERC-3643 token</p>
            </Link>
            <Link href="/sales/new" className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center hover:border-[var(--brand-teal)] hover:bg-gray-50">
              <p className="font-medium text-[var(--brand-dark)]">Start Sale</p>
              <p className="text-sm text-gray-500">Launch a new token sale</p>
            </Link>
            <Link href="/compliance" className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center hover:border-[var(--brand-teal)] hover:bg-gray-50">
              <p className="font-medium text-[var(--brand-dark)]">Compliance</p>
              <p className="text-sm text-gray-500">Manage freezes and transfers</p>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
