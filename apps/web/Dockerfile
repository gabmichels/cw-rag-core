# Use an official Node.js image as the base image
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---------- deps ----------
FROM base AS deps
# 1) copy workspace manifests (NO app-local lockfile)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# if you have a root .npmrc, copy it so settings match the lockfile
COPY .npmrc ./.npmrc
# prime cache: copy only relevant package manifests
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# optional: prefetch
RUN pnpm fetch --prefer-offline
# bring full source and install per-package (dev deps needed for Next)
COPY . .
ENV NODE_ENV=development
RUN pnpm -r install --no-frozen-lockfile

# ---------- builder ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
RUN pnpm --filter @cw-rag-core/shared run build
RUN pnpm --filter @cw-rag-core/web build
