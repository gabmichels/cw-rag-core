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
# Build shared packages
RUN pnpm --filter @cw-rag-core/shared run build

# Navigate to the web app directory for its build
WORKDIR /app/apps/web
# Ensure production build for Next.js
ENV NODE_ENV=production
RUN pnpm build

# ---------- runner ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Install pnpm for running the app
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy workspace configuration files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/.npmrc ./.npmrc

# Copy app-specific files
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy built shared packages
COPY --from=builder /app/packages ./packages

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npx", "next", "start"]
