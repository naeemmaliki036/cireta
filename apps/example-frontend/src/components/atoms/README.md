# Atoms

**Single HTML element wrappers** - the basic building blocks of the UI.

## Rules

1. **Wrap exactly one HTML element** (button, input, span, etc.)
2. **Use `forwardRef`** for DOM access
3. **Extend native HTML attributes** (`ButtonHTMLAttributes`, etc.)
4. **No business logic** - pure presentation
5. **Props only** - no local state, no hooks

## Example

```tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // Only additional props, not overrides
}

export const BaseButton = forwardRef<HTMLButtonElement, BaseButtonProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2',
        className
      )}
      {...props}
    />
  )
);

BaseButton.displayName = 'BaseButton';
```

## Categories

- `buttons/` - Button elements
- `inputs/` - Form input elements
- `display/` - Visual elements (Spinner, Skeleton, Badge)
- `feedback/` - User feedback (InputError, Tooltip)
