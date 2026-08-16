FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies and build
FROM base AS builder
WORKDIR /app
COPY apps/dashboard/package*.json ./apps/dashboard/

WORKDIR /app/apps/dashboard
COPY --from=builder_pkg . /workflow-orchestration-engine/packages/builder
RUN --mount=type=cache,id=npm-dtp-dashboard,target=/root/.npm npm ci
# Replace symlink with real directory to prevent Turbopack external root errors
RUN rm -rf node_modules/@local/builder && cp -r /workflow-orchestration-engine/packages/builder node_modules/@local/builder


# Copy only the directories the dashboard actually imports
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY runtime ./runtime
COPY apps/dashboard ./apps/dashboard

# Arguments for the build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_LAB_SERVICE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LAB_SERVICE_URL=$NEXT_PUBLIC_LAB_SERVICE_URL

# Note: Using npx next build explicitly for the dashboard workspace
RUN ln -s /app/apps/dashboard/node_modules /app/node_modules
RUN --mount=type=cache,id=nextjs-dtp-dashboard,target=/app/apps/dashboard/.next/cache cd apps/dashboard && npx next build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER nextjs

EXPOSE 3001

ENV PORT=3001

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "apps/dashboard/server.js"]
