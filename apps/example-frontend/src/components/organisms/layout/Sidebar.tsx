'use client';

import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface SidebarProps {
  /** Navigation items */
  items: SidebarItem[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Sidebar organism - vertical navigation sidebar.
 *
 * Used in dashboard layouts for secondary navigation.
 */
export function Sidebar({ items, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-64 shrink-0',
        'border-r border-[var(--border)]',
        'bg-[var(--surface)]',
        className
      )}
    >
      <nav className="p-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href;

            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md',
                    'text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                  )}
                >
                  {item.icon && (
                    <span className="shrink-0">{item.icon}</span>
                  )}
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
