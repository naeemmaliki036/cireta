# Apps

Deployable applications in the monorepo.

## Structure

```
apps/
├── example-frontend/    # Next.js 16 reference application
│   ├── src/
│   │   ├── app/         # Next.js App Router pages
│   │   ├── components/  # Atomic design components
│   │   ├── lib/         # Utilities, API, hooks, types
│   │   └── contexts/    # React contexts
│   └── ...config files
│
└── example-api/         # FastAPI reference application
    ├── api/             # API routes
    ├── services/        # Business logic
    └── core/            # App configuration
```

## Conventions

### Adding a New App

1. Create directory under `apps/`
2. Add `CLAUDE.md` with coding standards
3. Add `README.md` with setup instructions
4. Add Dockerfile at repository root: `Dockerfile.{app-name}`
5. Add env template: `.env.dockerfile.{app-name}`

### Frontend Apps

- Use Next.js 16+ with App Router
- Follow Atomic Design for components
- Use TypeScript strict mode
- Keep all frontend code within the app directory

### Backend Apps

- Use FastAPI with Pydantic
- Import shared code from `packages/common`
- Use service layer architecture
- Register routes in `api/v1/router.py`
