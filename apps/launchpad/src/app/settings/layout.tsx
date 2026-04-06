"use client";

import { DashboardLayout } from "@/components/templates";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        {children}
      </div>
    </DashboardLayout>
  );
}
