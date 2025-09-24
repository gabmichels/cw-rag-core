#!/bin/bash

# Create New Tenant Script
# Usage: ./scripts/create-tenant.sh <tenant-id> [options]

set -e

# Default configuration
PROJECT_PREFIX="cw-rag"
BASE_API_PORT=3000
BASE_WEB_PORT=3001
BASE_QDRANT_PORT=6333
BASE_QDRANT_GRPC_PORT=6334
BASE_N8N_PORT=5678
BASE_EMBEDDINGS_PORT=8080

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    cat << EOF
Usage: $0 <tenant-id> [options]

Create a new tenant configuration for the cw-rag-core system.

Arguments:
  tenant-id     Unique identifier for the tenant (e.g., acme-corp)

Options:
  --api-port PORT       API server port (default: auto-assigned)
  --web-port PORT       Web server port (default: auto-assigned)
  --qdrant-port PORT    Qdrant port (default: auto-assigned)
  --tier TIER           Tenant tier: basic|premium|enterprise (default: basic)
  --pii-policy POLICY   PII policy: OFF|BASIC|STRICT (default: BASIC)
  --help               Show this help message

Examples:
  $0 acme-corp
  $0 client-xyz --tier premium --pii-policy STRICT
  $0 healthcare-inc --api-port 3200 --tier enterprise

EOF
}

# Parse command line arguments
TENANT_ID=""
TIER="basic"
PII_POLICY="BASIC"
CUSTOM_API_PORT=""
CUSTOM_WEB_PORT=""
CUSTOM_QDRANT_PORT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --help)
            show_usage
            exit 0
            ;;
        --api-port)
            CUSTOM_API_PORT="$2"
            shift 2
            ;;
        --web-port)
            CUSTOM_WEB_PORT="$2"
            shift 2
            ;;
        --qdrant-port)
            CUSTOM_QDRANT_PORT="$2"
            shift 2
            ;;
        --tier)
            TIER="$2"
            shift 2
            ;;
        --pii-policy)
            PII_POLICY="$2"
            shift 2
            ;;
        --*)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [[ -z "$TENANT_ID" ]]; then
                TENANT_ID="$1"
            else
                log_error "Too many arguments"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$TENANT_ID" ]]; then
    log_error "Tenant ID is required"
    show_usage
    exit 1
fi

# Validate tenant ID format
if [[ ! "$TENANT_ID" =~ ^[a-z0-9-]+$ ]]; then
    log_error "Tenant ID must contain only lowercase letters, numbers, and hyphens"
    exit 1
fi

# Validate tier
if [[ ! "$TIER" =~ ^(basic|premium|enterprise)$ ]]; then
    log_error "Tier must be one of: basic, premium, enterprise"
    exit 1
fi

# Validate PII policy
if [[ ! "$PII_POLICY" =~ ^(OFF|BASIC|STRICT)$ ]]; then
    log_error "PII policy must be one of: OFF, BASIC, STRICT"
    exit 1
fi

log_info "Creating tenant: $TENANT_ID"

# Check if tenant already exists
if [[ -f ".env.$TENANT_ID" ]]; then
    log_error "Tenant $TENANT_ID already exists"
    exit 1
fi

# Find available ports
find_available_port() {
    local base_port=$1
    local increment=0

    while [[ $increment -lt 100 ]]; do
        local port=$((base_port + increment * 100))
        if ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo $port
            return
        fi
        increment=$((increment + 1))
    done

    log_error "Could not find available port starting from $base_port"
    exit 1
}

# Assign ports
if [[ -n "$CUSTOM_API_PORT" ]]; then
    API_PORT="$CUSTOM_API_PORT"
else
    API_PORT=$(find_available_port $BASE_API_PORT)
fi

if [[ -n "$CUSTOM_WEB_PORT" ]]; then
    WEB_PORT="$CUSTOM_WEB_PORT"
else
    WEB_PORT=$(find_available_port $BASE_WEB_PORT)
fi

if [[ -n "$CUSTOM_QDRANT_PORT" ]]; then
    QDRANT_PORT="$CUSTOM_QDRANT_PORT"
    QDRANT_GRPC_PORT=$((QDRANT_PORT + 1))
else
    QDRANT_PORT=$(find_available_port $BASE_QDRANT_PORT)
    QDRANT_GRPC_PORT=$((QDRANT_PORT + 1))
fi

N8N_PORT=$(find_available_port $BASE_N8N_PORT)
EMBEDDINGS_PORT=$(find_available_port $BASE_EMBEDDINGS_PORT)

# Generate secure token
INGEST_TOKEN="${TENANT_ID}-secure-token-$(date +%Y)"

# Set tier-specific configuration
case "$TIER" in
    "basic")
        RATE_LIMIT_PER_TENANT=500
        RATE_LIMIT_PER_USER=50
        MAX_DOCUMENTS=10000
        STORAGE_QUOTA_GB=5
        ;;
    "premium")
        RATE_LIMIT_PER_TENANT=2000
        RATE_LIMIT_PER_USER=200
        MAX_DOCUMENTS=50000
        STORAGE_QUOTA_GB=25
        ;;
    "enterprise")
        RATE_LIMIT_PER_TENANT=10000
        RATE_LIMIT_PER_USER=1000
        MAX_DOCUMENTS=500000
        STORAGE_QUOTA_GB=100
        ;;
esac

log_info "Assigned ports - API: $API_PORT, Web: $WEB_PORT, Qdrant: $QDRANT_PORT"

# Create environment file
log_info "Creating environment file: .env.$TENANT_ID"

cat > ".env.$TENANT_ID" << EOF
# Tenant Configuration for $TENANT_ID
# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Tier: $TIER

# Tenant Identity
TENANT=$TENANT_ID
PROJECT_PREFIX=$PROJECT_PREFIX

# Port Configuration (unique per tenant)
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
QDRANT_PORT=$QDRANT_PORT
QDRANT_GRPC_PORT=$QDRANT_GRPC_PORT
N8N_PORT=$N8N_PORT

# Container Names (unique per tenant)
API_CONTAINER_NAME=${PROJECT_PREFIX}-${TENANT_ID}-api
WEB_CONTAINER_NAME=${PROJECT_PREFIX}-${TENANT_ID}-web
QDRANT_CONTAINER_NAME=${PROJECT_PREFIX}-${TENANT_ID}-qdrant

# Volume Names (unique per tenant)
QDRANT_VOLUME_NAME=${PROJECT_PREFIX}_${TENANT_ID//-/_}_qdrant_storage
NETWORK_NAME=${PROJECT_PREFIX}-${TENANT_ID}-network

# Security Configuration
INGEST_TOKEN=$INGEST_TOKEN
CORS_ORIGIN=http://localhost:$WEB_PORT

# Tenant-Specific Features
VECTOR_DIM=384
PII_POLICY=$PII_POLICY
EMBEDDINGS_PROVIDER=local
EMBEDDINGS_MODEL=bge-small-en-v1.5

# Rate Limiting (tier: $TIER)
RATE_LIMIT_PER_IP=30
RATE_LIMIT_PER_USER=$RATE_LIMIT_PER_USER
RATE_LIMIT_PER_TENANT=$RATE_LIMIT_PER_TENANT
RATE_LIMIT_WINDOW_MINUTES=1

# Resource Limits (tier: $TIER)
MAX_DOCUMENTS=$MAX_DOCUMENTS
STORAGE_QUOTA_GB=$STORAGE_QUOTA_GB

# Timeout Configuration
VECTOR_SEARCH_TIMEOUT_MS=5000
KEYWORD_SEARCH_TIMEOUT_MS=3000
RERANKER_TIMEOUT_MS=10000
LLM_TIMEOUT_MS=25000
OVERALL_TIMEOUT_MS=45000
EMBEDDING_TIMEOUT_MS=5000

# Collection Configuration
QDRANT_COLLECTION=docs_v1

# Public API URL (adjust for production)
NEXT_PUBLIC_API_URL=http://localhost:$API_PORT
EOF

# Create Docker Compose file
log_info "Creating Docker Compose file: docker-compose.$TENANT_ID.yml"

cat > "docker-compose.$TENANT_ID.yml" << 'EOF'
# Tenant-specific Docker Compose configuration
# Auto-generated - do not edit manually

services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: ${QDRANT_CONTAINER_NAME}
    ports:
      - "${QDRANT_PORT}:6333"
      - "${QDRANT_GRPC_PORT}:6334"
    volumes:
      - qdrant_storage:/qdrant/data
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6333/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  embeddings:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-1.8
    container_name: ${PROJECT_PREFIX}-${TENANT}-embeddings
    ports:
      - "8080:80"
    environment:
      - MODEL_ID=BAAI/bge-small-en-v1.5
      - REVISION=main
      - MAX_CONCURRENT_REQUESTS=512
      - MAX_BATCH_TOKENS=65536
      - MAX_BATCH_REQUESTS=1024
      - MAX_CLIENT_BATCH_SIZE=32
      - VECTOR_DIM=${VECTOR_DIM}
    volumes:
      - embeddings_cache:/data
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:80/health || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: ${API_CONTAINER_NAME}
    ports:
      - "${API_PORT}:3000"
    environment:
      - QDRANT_URL=http://qdrant:6333
      - QDRANT_COLLECTION=${QDRANT_COLLECTION}
      - PORT=3000
      - CORS_ORIGIN=${CORS_ORIGIN}
      - TENANT=${TENANT}
      - VECTOR_DIM=${VECTOR_DIM}
      - PII_POLICY=${PII_POLICY}
      - EMBEDDINGS_PROVIDER=${EMBEDDINGS_PROVIDER}
      - EMBEDDINGS_MODEL=${EMBEDDINGS_MODEL}
      - EMBEDDINGS_URL=http://embeddings:80
      - INGEST_TOKEN=${INGEST_TOKEN}
      - VECTOR_SEARCH_TIMEOUT_MS=${VECTOR_SEARCH_TIMEOUT_MS}
      - KEYWORD_SEARCH_TIMEOUT_MS=${KEYWORD_SEARCH_TIMEOUT_MS}
      - RERANKER_TIMEOUT_MS=${RERANKER_TIMEOUT_MS}
      - LLM_TIMEOUT_MS=${LLM_TIMEOUT_MS}
      - OVERALL_TIMEOUT_MS=${OVERALL_TIMEOUT_MS}
      - EMBEDDING_TIMEOUT_MS=${EMBEDDING_TIMEOUT_MS}
      - RATE_LIMIT_PER_IP=${RATE_LIMIT_PER_IP}
      - RATE_LIMIT_PER_USER=${RATE_LIMIT_PER_USER}
      - RATE_LIMIT_PER_TENANT=${RATE_LIMIT_PER_TENANT}
      - RATE_LIMIT_WINDOW_MINUTES=${RATE_LIMIT_WINDOW_MINUTES}
    depends_on:
      qdrant:
        condition: service_healthy
      embeddings:
        condition: service_healthy
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/readyz || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 3
      start_period: 30s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: ${WEB_CONTAINER_NAME}
    ports:
      - "${WEB_PORT}:3000"
    environment:
      - API_URL=http://api:3000
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
      - TENANT=${TENANT}
    depends_on:
      api:
        condition: service_healthy
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000 || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  qdrant_storage:
    name: ${QDRANT_VOLUME_NAME}
  embeddings_cache:
    name: ${PROJECT_PREFIX}_${TENANT}_embeddings_cache
  n8n_data:
    name: ${PROJECT_PREFIX}_${TENANT}_n8n_data

networks:
  app_network:
    name: ${NETWORK_NAME}
    driver: bridge
EOF

# Update tenant registry
log_info "Updating tenant registry"

REGISTRY_FILE="tenants/registry.json"
mkdir -p tenants

if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo '{"tenants": []}' > "$REGISTRY_FILE"
fi

# Add tenant to registry using jq if available, otherwise manual approach
if command -v jq &> /dev/null; then
    temp_file=$(mktemp)
    jq --arg id "$TENANT_ID" \
       --arg name "$TENANT_ID" \
       --arg tier "$TIER" \
       --arg api_port "$API_PORT" \
       --arg web_port "$WEB_PORT" \
       --arg qdrant_port "$QDRANT_PORT" \
       --arg max_docs "$MAX_DOCUMENTS" \
       --arg rate_limit "$RATE_LIMIT_PER_TENANT" \
       --arg storage_gb "$STORAGE_QUOTA_GB" \
       --arg pii_policy "$PII_POLICY" \
       '.tenants += [{
         "id": $id,
         "name": $name,
         "tier": $tier,
         "status": "created",
         "createdAt": (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
         "configuration": {
           "ports": {
             "api": ($api_port | tonumber),
             "web": ($web_port | tonumber),
             "qdrant": ($qdrant_port | tonumber)
           },
           "limits": {
             "maxDocuments": ($max_docs | tonumber),
             "rateLimitPerTenant": ($rate_limit | tonumber),
             "storageQuotaGB": ($storage_gb | tonumber)
           },
           "features": {
             "piiDetection": $pii_policy,
             "tier": $tier
           }
         }
       }]' "$REGISTRY_FILE" > "$temp_file" && mv "$temp_file" "$REGISTRY_FILE"
else
    log_warn "jq not found, skipping registry update"
fi

# Create tenant-specific scripts
log_info "Creating tenant management scripts"

mkdir -p "scripts/tenants/$TENANT_ID"

# Start script
cat > "scripts/tenants/$TENANT_ID/start.sh" << EOF
#!/bin/bash
# Start $TENANT_ID tenant services

docker-compose --env-file .env.$TENANT_ID -f docker-compose.$TENANT_ID.yml up -d
EOF

# Stop script
cat > "scripts/tenants/$TENANT_ID/stop.sh" << EOF
#!/bin/bash
# Stop $TENANT_ID tenant services

docker-compose --env-file .env.$TENANT_ID -f docker-compose.$TENANT_ID.yml down
EOF

# Status script
cat > "scripts/tenants/$TENANT_ID/status.sh" << EOF
#!/bin/bash
# Check $TENANT_ID tenant status

echo "=== Tenant: $TENANT_ID ==="
echo "API Health: \$(curl -s http://localhost:$API_PORT/healthz || echo 'FAILED')"
echo "Web Status: \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$WEB_PORT || echo 'FAILED')"
echo "Qdrant Status: \$(curl -s http://localhost:$QDRANT_PORT/healthz || echo 'FAILED')"
echo
docker-compose --env-file .env.$TENANT_ID -f docker-compose.$TENANT_ID.yml ps
EOF

chmod +x "scripts/tenants/$TENANT_ID"/*.sh

# Create documentation
log_info "Creating tenant documentation"

mkdir -p "docs/tenants/$TENANT_ID"

cat > "docs/tenants/$TENANT_ID/README.md" << EOF
# Tenant: $TENANT_ID

## Configuration

- **Tier**: $TIER
- **Created**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- **PII Policy**: $PII_POLICY

## Access Information

- **API Endpoint**: http://localhost:$API_PORT
- **Web Interface**: http://localhost:$WEB_PORT
- **Qdrant Dashboard**: http://localhost:$QDRANT_PORT/dashboard

## Limits

- **Max Documents**: $MAX_DOCUMENTS
- **Rate Limit**: $RATE_LIMIT_PER_TENANT requests/minute
- **Storage Quota**: ${STORAGE_QUOTA_GB}GB

## Management Commands

\`\`\`bash
# Start services
./scripts/tenants/$TENANT_ID/start.sh

# Stop services
./scripts/tenants/$TENANT_ID/stop.sh

# Check status
./scripts/tenants/$TENANT_ID/status.sh
\`\`\`

## Security

- **Ingest Token**: \`$INGEST_TOKEN\`
- **Network**: Isolated Docker network
- **Data**: Tenant-specific volumes

## Next Steps

1. Start the tenant services: \`./scripts/tenants/$TENANT_ID/start.sh\`
2. Verify health: \`./scripts/tenants/$TENANT_ID/status.sh\`
3. Test document ingestion (see main documentation)
4. Configure monitoring and alerting
EOF

# Summary
log_info "✅ Tenant $TENANT_ID created successfully!"
echo
echo "📋 Summary:"
echo "   Tenant ID: $TENANT_ID"
echo "   Tier: $TIER"
echo "   API Port: $API_PORT"
echo "   Web Port: $WEB_PORT"
echo "   Qdrant Port: $QDRANT_PORT"
echo
echo "🚀 Next steps:"
echo "   1. Start services: ./scripts/tenants/$TENANT_ID/start.sh"
echo "   2. Check status: ./scripts/tenants/$TENANT_ID/status.sh"
echo "   3. Access web UI: http://localhost:$WEB_PORT"
echo "   4. Test API: curl http://localhost:$API_PORT/healthz"
echo
echo "📁 Files created:"
echo "   - .env.$TENANT_ID"
echo "   - docker-compose.$TENANT_ID.yml"
echo "   - scripts/tenants/$TENANT_ID/"
echo "   - docs/tenants/$TENANT_ID/"
echo
echo "🔐 Ingest token: $INGEST_TOKEN"