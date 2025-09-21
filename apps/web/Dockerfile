# Use an official Node.js image as the base image
FROM node:18-alpine AS base

# Set the working directory
WORKDIR /app

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install Next.js dependencies for `base` stage
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/web/pnpm-lock.yaml* apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# Build the Next.js application for `builder` stage
FROM base AS builder
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @cw-rag-core/web build

# Production image for `runner` stage
FROM base AS runner
# Set environment variables for Next.js
ENV NODE_ENV=production
# Update path to use Next.js binary
ENV PATH="/app/apps/web/.next/standalone:${PATH}"

WORKDIR /app/apps/web

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static .next/static
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose the port Next.js runs on
EXPOSE 3000

# Start the Next.js application
CMD ["node", "server.js"]