# ---- base ----
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- deps: cache store & install workspaces ----
FROM base AS deps
# Copy only manifests for cache
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/retrieval/package.json packages/retrieval/
COPY packages/ingestion-sdk/package.json packages/ingestion-sdk/
RUN pnpm fetch --prefer-offline

# Bring source, install
COPY . .
RUN pnpm -w install --no-frozen-lockfile

# ---- build: build workspace libs then API (build tsconfig excludes tests) ----
FROM deps AS build
RUN pnpm -w install --no-frozen-lockfile
# Ensure TypeScript is available for all packages
RUN pnpm --filter "@cw-rag-core/shared" add -D typescript
RUN pnpm --filter "@cw-rag-core/retrieval" add -D typescript
RUN pnpm --filter "@cw-rag-core/ingestion-sdk" add -D typescript
RUN pnpm --filter "@cw-rag-core/api" add -D typescript
RUN pnpm --filter "@cw-rag-core/shared" run build
RUN pnpm --filter "@cw-rag-core/retrieval" run build
RUN pnpm --filter "@cw-rag-core/ingestion-sdk" run build
RUN pnpm --filter "@cw-rag-core/api" run build

# ---- runtime: prod files for API only ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# 1) Staging workspace for deploy
WORKDIR /opt/app
COPY --from=deps /app ./

# 2) Ensure internal packages have their built outputs present pre-deploy
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/retrieval/dist packages/retrieval/dist
COPY --from=build /app/packages/ingestion-sdk/dist packages/ingestion-sdk/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# 3) Produce a pruned, production-only tree for the API
RUN pnpm --filter "@cw-rag-core/api" deploy --prod --legacy /opt/deploy

# 4) (Important) Ensure the deployed API has the compiled JS
COPY --from=build /app/apps/api/dist /opt/deploy/apps/api/dist

# 5) Launch
WORKDIR /opt/deploy/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]
