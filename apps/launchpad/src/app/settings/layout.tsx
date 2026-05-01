"use client";

import { DashboardLayout } from "@/components/templates";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div className="py-2">
        {children}
      </div>
    </DashboardLayout>
  );
}
