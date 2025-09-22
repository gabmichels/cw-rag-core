FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/evals/package.json ./packages/evals/
COPY packages/shared/package.json ./packages/shared/

# Install pnpm
RUN npm install -g pnpm@8

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/evals ./packages/evals
COPY packages/shared ./packages/shared

# Build packages
RUN cd packages/shared && pnpm build
RUN cd packages/evals && pnpm build

# Set the default working directory to evals
WORKDIR /app/packages/evals

# Create evaluation user
RUN groupadd -r evaluser && useradd -r -g evaluser evaluser
RUN chown -R evaluser:evaluser /app
USER evaluser

# Environment variables
ENV NODE_ENV=production
ENV EVAL_API_URL=http://api:3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f ${EVAL_API_URL}/healthz || exit 1

# Default command
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["run", "--dataset", "all", "--verbose"]