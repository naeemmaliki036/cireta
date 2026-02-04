'use client';

import { cn } from '@/lib/utils/cn';

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TabNavProps {
  /** Tab items */
  tabs: TabItem[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab is clicked */
  onTabChange: (tabId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Tab navigation molecule.
 *
 * @example
 * const [activeTab, setActiveTab] = useState('overview');
 *
 * <TabNav
 *   tabs={[
 *     { id: 'overview', label: 'Overview' },
 *     { id: 'settings', label: 'Settings' },
 *   ]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 */
export function TabNav({
  tabs,
  activeTab,
  onTabChange,
  className,
}: TabNavProps) {
  return (
    <nav
      role="tablist"
      className={cn(
        'flex border-b border-[var(--border)]',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              'border-b-2 -mb-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
              'focus-visible:ring-[var(--brand-primary)]',
              isActive
                ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              tab.disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
