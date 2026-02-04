# Dockerfile for example-frontend
# Build from repository root: docker build -f Dockerfile.example-frontend -t example-frontend .

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json ./
COPY apps/example-frontend/package.json ./apps/example-frontend/

# Install dependencies
RUN npm install --workspace=apps/example-frontend

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/example-frontend/node_modules ./apps/example-frontend/node_modules

# Copy source
COPY package.json ./
COPY apps/example-frontend ./apps/example-frontend

# Build arguments for environment
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the application
WORKDIR /app/apps/example-frontend
RUN npm run build

# =============================================================================
# Stage 3: Runner
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/example-frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/example-frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/example-frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
