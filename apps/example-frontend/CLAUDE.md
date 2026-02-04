# CLAUDE.md - Frontend Coding Standards

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **React**: React 19
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript (strict mode)
- **State**: React Context + hooks

## Atomic Design Hierarchy

```
atoms/      → Single HTML element wrappers (Button, Input, Spinner)
    ↓
molecules/  → Groups of atoms working together (TextField, TabNav)
    ↓
organisms/  → Complex page sections (Header, Sidebar, DataTable)
    ↓
templates/  → Page layouts without content (DashboardLayout, AuthLayout)
    ↓
pages/      → Next.js app/ routes with content
```

### Component Placement Rules

| Level | Max Complexity | State | API Calls | Example |
|-------|---------------|-------|-----------|---------|
| Atoms | Single element | Props only | Never | `<BaseButton>`, `<Spinner>` |
| Molecules | 2-5 atoms | Local state OK | Never | `<TextField>`, `<Button>` |
| Organisms | Multiple molecules | Complex state | Yes | `<Header>`, `<UserTable>` |
| Templates | Layout structure | Context only | Via children | `<DashboardLayout>` |

## Component Rules

### All Components

- **Max 300 LOC** - Split when exceeding
- **TypeScript strict** - No `any`, explicit types
- **Props interface** - Always define and export

### Atoms

```tsx
// ✅ Correct: forwardRef, extends HTML attributes
export const BaseButton = forwardRef<HTMLButtonElement, BaseButtonProps>(
  ({ className, ...props }, ref) => (
    <button ref={ref} className={cn("base-styles", className)} {...props} />
  )
);

// Props extend HTML element attributes
interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // Additional props only
}
```

### Molecules

```tsx
// Compose atoms, add interactivity
export function Button({ isLoading, children, ...props }: ButtonProps) {
  return (
    <BaseButton {...props} disabled={isLoading || props.disabled}>
      {isLoading ? <Spinner /> : children}
    </BaseButton>
  );
}
```

### CSS Variables

Use Tailwind's arbitrary value syntax for CSS variables:

```tsx
// ✅ Correct
<div className="bg-[var(--brand-primary)] text-[var(--text-primary)]">

// ❌ Incorrect - hardcoded colors
<div className="bg-blue-500">
```

## File Organization

### Path Aliases (tsconfig.json)

```typescript
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { useAuth } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils/cn';
```

### Component File Structure

```
components/
├── atoms/
│   ├── README.md
│   ├── buttons/
│   │   └── BaseButton.tsx
│   └── inputs/
│       └── BaseInput.tsx
└── molecules/
    ├── README.md
    └── forms/
        └── TextField.tsx
```

## Repository Pattern

**Never use raw `fetch()`** - All API calls go through repositories.

```typescript
// ✅ Correct
import { userRepository } from '@/lib/api/repositories/UserRepository';
const users = await userRepository.getAll();

// ❌ Incorrect
const res = await fetch('/api/users');
```

## Hook Guidelines

- **Max 150 LOC** - Split when exceeding
- **Prefix with `use`** - `useAuth`, `useDebounce`
- **Single responsibility** - One concern per hook

```typescript
// ✅ Split complex hooks
function useUserData(userId: string) {
  const { user, isLoading } = useUserQuery(userId);
  const { permissions } = useUserPermissions(userId);
  return { user, isLoading, permissions };
}
```

## Context Guidelines

### Global Contexts (in `contexts/`)

- Theme
- Auth
- Notifications

### Scoped Contexts (colocated)

- Form state
- Feature-specific state

```tsx
// ✅ Global context
// contexts/AuthContext.tsx
export const AuthProvider = ({ children }) => { ... };

// ✅ Scoped context
// features/checkout/CheckoutContext.tsx
export const CheckoutProvider = ({ children }) => { ... };
```

## Import Organization

```typescript
// 1. React/Next
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party
import { clsx } from 'clsx';

// 3. Internal aliases
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { cn } from '@/lib/utils/cn';

// 4. Relative imports
import { localHelper } from './helpers';
```

## Error Handling

```typescript
// Use error boundaries for component errors
<ErrorBoundary fallback={<ErrorFallback />}>
  <UserProfile />
</ErrorBoundary>

// Use try/catch in async operations
try {
  await userRepository.create(data);
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.message);
  }
}
```

## Performance

- Use `React.memo` for expensive renders
- Use `useMemo`/`useCallback` judiciously (not everywhere)
- Lazy load heavy components with `dynamic()`
- Optimize images with `next/image`
