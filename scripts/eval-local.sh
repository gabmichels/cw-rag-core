#!/bin/bash

# Local evaluation script for development and testing
# Usage: ./scripts/eval-local.sh [dataset] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DATASET="${1:-all}"
CLEANUP="${CLEANUP:-true}"
VERBOSE="${VERBOSE:-true}"
PARALLEL="${PARALLEL:-false}"
MAX_CONCURRENCY="${MAX_CONCURRENCY:-3}"
OUTPUT_DIR="${OUTPUT_DIR:-./eval-results}"

echo -e "${BLUE}🧪 Starting Local Evaluation${NC}"
echo -e "${BLUE}Dataset: ${DATASET}${NC}"
echo -e "${BLUE}Output: ${OUTPUT_DIR}${NC}"

# Function to cleanup
cleanup() {
    if [ "$CLEANUP" = "true" ]; then
        echo -e "${YELLOW}🧹 Cleaning up Docker resources...${NC}"
        docker-compose -f docker-compose.eval.yml down --volumes --remove-orphans 2>/dev/null || true
        docker system prune -f 2>/dev/null || true
    fi
}

# Register cleanup function
trap cleanup EXIT

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}❌ docker-compose is not installed. Please install it and try again.${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}🚀 Starting evaluation infrastructure...${NC}"

# Start core services (qdrant, redis, api)
docker-compose -f docker-compose.eval.yml up -d qdrant redis

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for Qdrant to be ready...${NC}"
timeout 60 bash -c 'until curl -f http://localhost:6333/ >/dev/null 2>&1; do sleep 2; done' || {
    echo -e "${RED}❌ Qdrant failed to start within 60 seconds${NC}"
    exit 1
}

echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
timeout 30 bash -c 'until docker-compose -f docker-compose.eval.yml exec -T redis redis-cli ping >/dev/null 2>&1; do sleep 1; done' || {
    echo -e "${RED}❌ Redis failed to start within 30 seconds${NC}"
    exit 1
}

# Start API service
echo -e "${BLUE}🚀 Starting API service...${NC}"
docker-compose -f docker-compose.eval.yml up -d api

# Wait for API to be ready
echo -e "${YELLOW}⏳ Waiting for API to be ready...${NC}"
timeout 90 bash -c 'until curl -f http://localhost:3000/healthz >/dev/null 2>&1; do sleep 3; done' || {
    echo -e "${RED}❌ API failed to start within 90 seconds${NC}"
    docker-compose -f docker-compose.eval.yml logs api
    exit 1
}

echo -e "${GREEN}✅ Infrastructure is ready${NC}"

# Run evaluation
echo -e "${BLUE}🧪 Running evaluation...${NC}"

# Set environment variables for evaluation
export EVAL_DATASET="$DATASET"
export EVAL_PARALLEL="$PARALLEL"
export EVAL_MAX_CONCURRENCY="$MAX_CONCURRENCY"
export EVAL_VERBOSE="$VERBOSE"

# Run the evaluator
if docker-compose -f docker-compose.eval.yml --profile evaluation run --rm evaluator; then
    echo -e "${GREEN}✅ Evaluation completed successfully${NC}"

    # Copy results from container
    if docker volume ls | grep -q eval-results; then
        echo -e "${BLUE}📄 Copying results to ${OUTPUT_DIR}...${NC}"
        docker run --rm -v eval-results:/source -v "$(pwd)/${OUTPUT_DIR}:/dest" alpine cp -r /source/. /dest/
    fi

    # Show summary
    if [ -f "${OUTPUT_DIR}/ci-summary.json" ]; then
        echo -e "${BLUE}📊 Evaluation Summary:${NC}"
        cat "${OUTPUT_DIR}/ci-summary.json" | jq '.'

        # Check status
        status=$(cat "${OUTPUT_DIR}/ci-summary.json" | jq -r '.status')
        if [ "$status" = "FAILED" ]; then
            echo -e "${RED}❌ Evaluation failed - check thresholds${NC}"
            exit 1
        elif [ "$status" = "WARNING" ]; then
            echo -e "${YELLOW}⚠️ Evaluation passed with warnings${NC}"
        else
            echo -e "${GREEN}✅ All evaluations passed${NC}"
        fi
    fi

    # Show dashboard location
    if [ -f "${OUTPUT_DIR}/dashboard.html" ]; then
        echo -e "${GREEN}📊 Dashboard available at: file://$(pwd)/${OUTPUT_DIR}/dashboard.html${NC}"
    fi

else
    echo -e "${RED}❌ Evaluation failed${NC}"
    echo -e "${YELLOW}📋 Checking API logs:${NC}"
    docker-compose -f docker-compose.eval.yml logs api | tail -50
    exit 1
fi

echo -e "${GREEN}🎉 Local evaluation completed successfully!${NC}"