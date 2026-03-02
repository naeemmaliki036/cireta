# Dockerfile.launchpad — cireta investor portal
# Build from repo root: docker build -f Dockerfile.launchpad -t cireta-launchpad .

# Stage 1: deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/launchpad/package*.json ./
RUN npm ci --legacy-peer-deps

# Stage 2: builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/launchpad .
RUN npm run build

# Stage 3: runner (non-root)
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --ingroup appgroup --shell /bin/sh --disabled-password appuser

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
