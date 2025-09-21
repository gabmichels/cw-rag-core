# Use a Node.js 20 environment as a base image
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set the working directory in the container
WORKDIR /app

# Copy root package files and workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Copy package.json files for all workspace packages
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/retrieval/package.json ./packages/retrieval/
COPY packages/ingestion-sdk/package.json ./packages/ingestion-sdk/

# Install dependencies for the entire monorepo (including dev dependencies for compilation)
RUN pnpm install --frozen-lockfile

# Copy the source directories
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/retrieval/src ./packages/retrieval/src
COPY packages/retrieval/package.json ./packages/retrieval/
COPY packages/retrieval/tsconfig.json ./packages/retrieval/
COPY packages/ingestion-sdk/src ./packages/ingestion-sdk/src
COPY packages/ingestion-sdk/package.json ./packages/ingestion-sdk/
COPY packages/ingestion-sdk/tsconfig.json ./packages/ingestion-sdk/
COPY apps/api/src ./apps/api/src
COPY apps/api/package.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/

# Build TypeScript code
RUN pnpm --filter "@cw-rag-core/shared" build
RUN pnpm --filter "@cw-rag-core/retrieval" build
RUN pnpm --filter "@cw-rag-core/ingestion-sdk" build
RUN pnpm --filter "@cw-rag-core/api" build

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["pnpm", "--filter", "@cw-rag-core/api", "start"]