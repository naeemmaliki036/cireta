# Templates

**Page layouts without content** - structural components that define page structure.

## Rules

1. **Define page structure** using CSS Grid/Flexbox
2. **Accept children** for content slots
3. **Connect to global context** (theme, auth)
4. **No business logic** - pure layout

## Example

```tsx
import { Header } from '@/organisms/layout/Header';
import { Sidebar } from '@/organisms/layout/Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex">
        <Sidebar items={sidebarItems} />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

## Available Templates

- `DashboardLayout` - Main app layout with header and sidebar
- `AuthLayout` - Centered layout for login/register pages
