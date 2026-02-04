# Example Frontend

Next.js 16 reference application demonstrating best practices.

## Quick Start

```bash
# From repository root
npm run dev:frontend

# Or from this directory
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **Tailwind CSS 4** - Utility-first styling
- **TypeScript** - Type safety

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── (dashboard)/        # Authenticated routes
│   └── api/                # API routes (proxy)
│
├── components/             # Atomic Design components
│   ├── atoms/              # Basic building blocks
│   ├── molecules/          # Composed atoms
│   ├── organisms/          # Complex sections
│   ├── templates/          # Page layouts
│   └── providers/          # Provider composition
│
├── lib/                    # Utilities and services
│   ├── api/                # API client and repositories
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Helper functions
│   └── types/              # TypeScript types
│
├── contexts/               # React contexts
│   ├── ThemeContext.tsx
│   └── AuthContext.tsx
│
└── styles/
    └── globals.css         # Global styles and Tailwind
```

## Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
npm run typecheck # Run TypeScript check
```

### Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_API_URL` - Backend API URL

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Coding standards
- [components/README.md](./src/components/README.md) - Component guidelines
