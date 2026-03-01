FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/launchpad/package*.json ./apps/launchpad/
RUN cd apps/launchpad && npm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/apps/launchpad/node_modules ./apps/launchpad/node_modules
COPY apps/launchpad/ ./apps/launchpad/
RUN cd apps/launchpad && npm run build

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder /app/apps/launchpad/.next/standalone ./
COPY --from=builder /app/apps/launchpad/.next/static ./apps/launchpad/.next/static
COPY --from=builder /app/apps/launchpad/public ./apps/launchpad/public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "apps/launchpad/server.js"]
