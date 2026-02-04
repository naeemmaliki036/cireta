# Scripts

Development and automation scripts.

## Structure

```
scripts/
├── README.md           # This file
├── setup.sh            # Initial project setup
├── seed.py             # Database seeding
└── deploy.sh           # Deployment helpers
```

## Usage

Most common operations are available via Makefile:

```bash
make dev          # Start development servers
make test         # Run tests
make lint         # Run linters
make format       # Format code
make db-migrate   # Create migration
make db-upgrade   # Apply migrations
```

## Adding Scripts

1. Create script in this directory
2. Add execution permission: `chmod +x scripts/your-script.sh`
3. Document usage in this README
4. Consider adding Makefile target for common operations
