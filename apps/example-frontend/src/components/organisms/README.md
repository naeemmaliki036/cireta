# Organisms

**Complex page sections** - self-contained UI components that combine molecules and atoms.

## Rules

1. **Compose multiple molecules** (and atoms)
2. **Can have complex state** (multiple useState, reducers)
3. **Can make API calls** (via repositories)
4. **Should be reusable** across different pages

## Example

```tsx
import { useState } from 'react';
import { Button } from '@/molecules/buttons/Button';
import { TextField } from '@/molecules/forms/TextField';
import { userRepository } from '@/lib/api/repositories/UserRepository';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await userRepository.login({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
      });
      onSuccess();
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField label="Email" name="email" type="email" required />
      <TextField label="Password" name="password" type="password" required />
      {error && <p className="text-error">{error}</p>}
      <Button type="submit" isLoading={isLoading} fullWidth>
        Sign In
      </Button>
    </form>
  );
}
```

## Categories

- `layout/` - Layout components (Header, Sidebar, Footer)
- `forms/` - Complex forms (LoginForm, ProfileForm)
- `data/` - Data display (DataTable, UserCard)
