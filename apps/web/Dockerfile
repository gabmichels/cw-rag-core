# ---------- base ----------
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./.npmrc
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm fetch --prefer-offline
COPY . .
ENV NODE_ENV=development
RUN pnpm -r install --no-frozen-lockfile

# ---------- builder ----------
FROM base AS builder
WORKDIR /app

# Build arguments for tenant branding
ARG NEXT_PUBLIC_TENANT_BRAND_NAME=RAG Chat
ARG NEXT_PUBLIC_TENANT_LOGO_URL
ARG NEXT_PUBLIC_TENANT_PRIMARY_COLOR=#3b82f6
ARG NEXT_PUBLIC_TENANT_SECONDARY_COLOR=#6366f1
ARG NEXT_PUBLIC_TENANT_THEME=default

# Set as environment variables for the build
ENV NEXT_PUBLIC_TENANT_BRAND_NAME=$NEXT_PUBLIC_TENANT_BRAND_NAME
ENV NEXT_PUBLIC_TENANT_LOGO_URL=$NEXT_PUBLIC_TENANT_LOGO_URL
ENV NEXT_PUBLIC_TENANT_PRIMARY_COLOR=$NEXT_PUBLIC_TENANT_PRIMARY_COLOR
ENV NEXT_PUBLIC_TENANT_SECONDARY_COLOR=$NEXT_PUBLIC_TENANT_SECONDARY_COLOR
ENV NEXT_PUBLIC_TENANT_THEME=$NEXT_PUBLIC_TENANT_THEME

COPY --from=deps /app ./
RUN pnpm --filter @cw-rag-core/shared run build
# (uncomment if web imports retrieval too)
# RUN pnpm --filter @cw-rag-core/retrieval run build
RUN pnpm --filter @cw-rag-core/web build

# ---------- runner ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Copy Next standalone output preserving its internal paths
COPY --from=builder /app/apps/web/.next/standalone ./
# Static assets + public for the web app
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# (optional sanity)
# RUN test -f apps/web/server.js && echo "Found apps/web/server.js"

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
