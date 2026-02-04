'use client';

import { Header } from '@/organisms/layout/Header';
import { Sidebar, type SidebarItem } from '@/organisms/layout/Sidebar';
import { cn } from '@/lib/utils/cn';

const sidebarItems: SidebarItem[] = [
  { id: 'overview', label: 'Overview', href: '/dashboard' },
  { id: 'projects', label: 'Projects', href: '/dashboard/projects' },
  { id: 'settings', label: 'Settings', href: '/dashboard/settings' },
];

export interface DashboardLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Additional CSS classes for main content */
  className?: string;
}

/**
 * Dashboard layout template.
 *
 * Provides header, sidebar, and main content area for authenticated pages.
 *
 * @example
 * <DashboardLayout>
 *   <h1>Dashboard</h1>
 *   <DashboardContent />
 * </DashboardLayout>
 */
export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface)]">
      <Header />

      <div className="flex-1 flex">
        <Sidebar items={sidebarItems} className="hidden lg:block" />

        <main
          className={cn(
            'flex-1 p-6',
            'max-w-7xl mx-auto w-full',
            className
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
