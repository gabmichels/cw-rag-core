# Multi-Tenant Transformation Plan

## Current State Analysis

Your codebase is **80% multi-tenant ready** but lacks the infrastructure files that tie everything together:

### ✅ What You Have
- Excellent tenant management scripts ([`scripts/create-tenant.sh`](../../scripts/create-tenant.sh), [`scripts/manage-tenants.sh`](../../scripts/manage-tenants.sh))
- Individual service Dockerfiles ([`apps/api/Dockerfile`](../../apps/api/Dockerfile), [`apps/web/Dockerfile`](../../apps/web/Dockerfile))
- Current `.env` configuration for zenithfall tenant
- Tenant filtering in codebase (confirmed from codebase search)
- RBAC system with tenant boundaries

### ❌ What's Missing
- **Base Docker Compose template** - Scripts expect [`docker-compose.yml`](../../docker-compose.yml) at root
- **Zenithfall as proper tenant** - Current setup is hardcoded, not following tenant conventions
- **Tenant registry** - Scripts expect [`tenants/registry.json`](../../tenants/registry.json)
- **Windows-compatible script fixes** - Port detection and environment loading

## Transformation Steps

### Step 1: Create Base Docker Compose Template

Based on your current setup, create a complete multi-service Docker Compose template:

```yaml
# docker-compose.yml - Base template for all tenants
version: '3.8'

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
      - xenova-cache:/opt/cache
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
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LLM_ENABLED=${LLM_ENABLED}
      - LLM_PROVIDER=${LLM_PROVIDER}
      - LLM_MODEL=${LLM_MODEL}
      - LLM_STREAMING=${LLM_STREAMING}
      - LLM_TIMEOUT_MS=${LLM_TIMEOUT_MS}
      - ANSWERABILITY_THRESHOLD=${ANSWERABILITY_THRESHOLD}
      - VECTOR_SEARCH_TIMEOUT_MS=${VECTOR_SEARCH_TIMEOUT_MS}
      - KEYWORD_SEARCH_TIMEOUT_MS=${KEYWORD_SEARCH_TIMEOUT_MS}
      - RERANKER_TIMEOUT_MS=${RERANKER_TIMEOUT_MS}
      - OVERALL_TIMEOUT_MS=${OVERALL_TIMEOUT_MS}
      - EMBEDDING_TIMEOUT_MS=${EMBEDDING_TIMEOUT_MS}
      - RATE_LIMIT_PER_IP=${RATE_LIMIT_PER_IP}
      - RATE_LIMIT_PER_USER=${RATE_LIMIT_PER_USER}
      - RATE_LIMIT_PER_TENANT=${RATE_LIMIT_PER_TENANT}
      - RATE_LIMIT_WINDOW_MINUTES=${RATE_LIMIT_WINDOW_MINUTES}
      - XDG_CACHE_HOME=/opt/cache
    volumes:
      - xenova-cache:/opt/cache
    depends_on:
      qdrant:
        condition: service_healthy
      embeddings:
        condition: service_healthy
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
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
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - NEXT_TELEMETRY_DISABLED=1
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
  xenova-cache:
    name: ${PROJECT_PREFIX}_${TENANT}_xenova_cache

networks:
  app_network:
    name: ${NETWORK_NAME}
    driver: bridge
```

### Step 2: Convert Current Setup to Zenithfall Tenant

Transform your current setup to follow tenant conventions:

```bash
# Copy current .env to zenithfall tenant configuration
cp .env .env.zenithfall

# Create tenant registry with zenithfall as first tenant
mkdir -p tenants
echo '{
  "tenants": [
    {
      "id": "zenithfall",
      "name": "Zenithfall",
      "tier": "development",
      "status": "active",
      "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "configuration": {
        "ports": {
          "api": 3000,
          "web": 3001,
          "qdrant": 6333,
          "qdrant_grpc": 6334
        },
        "limits": {
          "maxDocuments": 100000,
          "rateLimitPerTenant": 1000,
          "storageQuotaGB": 50
        },
        "features": {
          "piiDetection": "OFF",
          "tier": "development"
        }
      }
    }
  ]
}' > tenants/registry.json

# Create zenithfall-specific Docker Compose
cp docker-compose.yml docker-compose.zenithfall.yml
```

### Step 3: Fix Scripts for Windows Compatibility

#### A. Fix Port Detection in [`scripts/create-tenant.sh`](../../scripts/create-tenant.sh)

Replace the `find_available_port()` function (around line 147):

```bash
# Windows-compatible port detection
find_available_port() {
    local base_port=$1
    local increment=0

    while [[ $increment -lt 100 ]]; do
        local port=$((base_port + increment * 100))
        # Windows-compatible port check using PowerShell if netstat fails
        if command -v netstat &> /dev/null; then
            if ! netstat -an 2>/dev/null | grep -q ":$port "; then
                echo $port
                return
            fi
        else
            # Fallback for Windows without netstat in PATH
            if ! powershell -Command "(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)" 2>/dev/null; then
                echo $port
                return
            fi
        fi
        increment=$((increment + 1))
    done

    log_error "Could not find available port starting from $base_port"
    exit 1
}
```

#### B. Fix Environment Loading in [`scripts/manage-tenants.sh`](../../scripts/manage-tenants.sh)

Replace the `get_tenant_config()` function (around line 73):

```bash
# Windows-safe environment loading
get_tenant_config() {
    local tenant_id="$1"
    local config_file=".env.$tenant_id"

    if [[ ! -f "$config_file" ]]; then
        log_error "Tenant $tenant_id not found"
        return 1
    fi

    # Windows-safe environment loading
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ $line =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue

        # Export valid environment variables
        if [[ $line =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            export "$line"
        fi
    done < "$config_file"
}
```

### Step 4: Test Transformation

```bash
# 1. Test that zenithfall still works with new structure
./scripts/manage-tenants.sh list
./scripts/manage-tenants.sh status zenithfall

# 2. Start zenithfall with new setup
./scripts/manage-tenants.sh start zenithfall

# 3. Verify health
curl http://localhost:3000/healthz
curl http://localhost:3001
```

### Step 5: Create 'gabmichels' Tenant

```bash
# Create your personal tenant
./scripts/create-tenant.sh gabmichels --tier premium --api-port 3100

# Start gabmichels tenant
./scripts/tenants/gabmichels/start.sh

# Verify both tenants running
./scripts/manage-tenants.sh health-check
```

### Step 6: Test Multi-Tenant Isolation

```bash
# Ingest test documents for zenithfall
curl -X POST http://localhost:3000/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: zenithfall-secure-token-2024" \
  -d '{
    "content": "Zenithfall confidential data",
    "metadata": {"tenantId": "zenithfall", "docId": "test-001"}
  }'

# Ingest test documents for gabmichels
curl -X POST http://localhost:3100/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: gabmichels-secure-token-2024" \
  -d '{
    "content": "Gabmichels personal notes",
    "metadata": {"tenantId": "gabmichels", "docId": "personal-001"}
  }'

# Test isolation - zenithfall should only see zenithfall data
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "confidential",
    "userContext": {"tenantId": "zenithfall"}
  }'

# Test isolation - gabmichels should only see gabmichels data
curl -X POST http://localhost:3100/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "personal",
    "userContext": {"tenantId": "gabmichels"}
  }'
```

## Expected Results

After transformation:

### ✅ Perfect Tenant Isolation
- **zenithfall**: `http://localhost:3000` (API), `http://localhost:3001` (Web)
- **gabmichels**: `http://localhost:3100` (API), `http://localhost:3101` (Web)
- Separate Docker networks: `cw-rag-zenithfall-network`, `cw-rag-gabmichels-network`
- Separate volumes: `cw_rag_zenithfall_qdrant_storage`, `cw_rag_gabmichels_qdrant_storage`

### ✅ Easy Management
```bash
# List all tenants
./scripts/manage-tenants.sh list

# Health check all tenants
./scripts/manage-tenants.sh health-check

# Update all tenants to new version
./scripts/manage-tenants.sh update-all
```

### ✅ Data Isolation Verified
- Cross-tenant queries return no results
- Each tenant has completely separate data
- Updates to core code affect both tenants equally

## Next Steps: Cloud + Whitelabeling

Once local multi-tenancy is working:

1. **Cloud Deployment**: Deploy exact same containers to GCP with separate projects
2. **Whitelabeling**: Add tenant-specific branding system
3. **User Management**: Add Firebase Auth + Firestore per tenant
4. **Subdomains**: Automatic `gabmichels.yourdomain.com` deployment

## Files to Create/Modify

1. **Create**: [`docker-compose.yml`](../../docker-compose.yml) - Base template
2. **Create**: [`tenants/registry.json`](../../tenants/registry.json) - Tenant registry
3. **Create**: [`.env.zenithfall`](../../.env.zenithfall) - Zenithfall tenant config
4. **Create**: [`docker-compose.zenithfall.yml`](../../docker-compose.zenithfall.yml) - Zenithfall compose
5. **Modify**: [`scripts/create-tenant.sh`](../../scripts/create-tenant.sh) - Windows compatibility
6. **Modify**: [`scripts/manage-tenants.sh`](../../scripts/manage-tenants.sh) - Windows compatibility

Ready to start implementation in Code mode!