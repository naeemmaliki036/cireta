# Components

This directory follows **Atomic Design** methodology for organizing UI components.

## Hierarchy

```
atoms/      → Single HTML element wrappers
    ↓
molecules/  → Groups of atoms working together
    ↓
organisms/  → Complex page sections
    ↓
templates/  → Page layouts without content
    ↓
pages/      → Next.js app/ routes with content
```

## Quick Reference

| Level | Max Complexity | State | API Calls | Example |
|-------|---------------|-------|-----------|---------|
| **Atoms** | Single element | Props only | Never | Button, Input, Spinner |
| **Molecules** | 2-5 atoms | Local state | Never | TextField, TabNav |
| **Organisms** | Multiple molecules | Complex state | Yes | Header, DataTable |
| **Templates** | Layout structure | Context only | Via children | DashboardLayout |

## Guidelines

### Atoms
- Wrap a single HTML element
- Use `forwardRef` for DOM access
- Extend native HTML attributes
- No business logic

### Molecules
- Compose multiple atoms
- Add interactivity (loading states, validation)
- Local state only (no global state)
- No API calls

### Organisms
- Compose molecules and atoms
- Can have complex state
- Can make API calls
- Should be reusable across pages

### Templates
- Define page structure
- Use CSS Grid/Flexbox for layout
- Accept children for content slots
- Connect to global context (theme, auth)

## Import Aliases

```typescript
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { Button } from '@/molecules/buttons/Button';
import { Header } from '@/organisms/layout/Header';
import { DashboardLayout } from '@/templates/DashboardLayout';
```
