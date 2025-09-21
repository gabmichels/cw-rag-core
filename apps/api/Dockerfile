# Use a Node.js 20 environment as a base image
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set the working directory in the container
WORKDIR /app

# Copy root package files and workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files for all workspace packages
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/retrieval/package.json ./packages/retrieval/

# Install dependencies for the entire monorepo
RUN pnpm install --frozen-lockfile --prod

# Copy the pre-built dist folders and necessary config files
COPY packages/shared/dist ./packages/shared/dist
COPY packages/shared/package.json ./packages/shared/
COPY packages/retrieval/dist ./packages/retrieval/dist
COPY packages/retrieval/package.json ./packages/retrieval/
COPY apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["pnpm", "--filter", "@cw-rag-core/api", "start"]