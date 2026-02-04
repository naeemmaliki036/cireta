# Molecules

**Groups of atoms working together** - functional UI components with interactivity.

## Rules

1. **Compose 2-5 atoms** (or other molecules)
2. **Add interactivity** (loading states, validation, animations)
3. **Local state only** - no global state or context
4. **No API calls** - pass callbacks for data operations

## Example

```tsx
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { Spinner } from '@/atoms/display/Spinner';
import { cn } from '@/lib/utils/cn';
import { buttonVariants } from '@/lib/utils/variants';

interface ButtonProps extends React.ComponentPropsWithRef<typeof BaseButton> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? <Spinner size="sm" /> : children}
    </BaseButton>
  );
}
```

## Categories

- `buttons/` - Button compositions (with loading, icons)
- `forms/` - Form input compositions (TextField, Select)
- `navigation/` - Navigation elements (TabNav, Breadcrumb)
