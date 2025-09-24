# Multi-Tenant Implementation Plan

## Current State Assessment

### ✅ Already Implemented (80% Complete)
Your codebase already has the core multi-tenancy infrastructure:

1. **Data Layer Isolation**
   - ✅ [`DocumentMetadata`](../packages/shared/src/types/document.ts) includes `tenantId` field
   - ✅ [`searchDocuments()`](../apps/api/src/services/qdrant.ts) enforces tenant filtering
   - ✅ [`hasDocumentAccess()`](../packages/shared/src/utils/rbac.ts) validates tenant boundaries

2. **Infrastructure Ready**
   - ✅ Docker Compose with environment variable support
   - ✅ Container naming includes tenant identifier
   - ✅ Volume and network naming supports tenant isolation
   - ✅ Shared packages architecture (`@cw-rag-core/*`)

3. **Current "Zenithfall" Tenant**
   - ✅ Working as proof-of-concept tenant
   - ✅ All services operational (API, Web, Qdrant, Embeddings)

## Implementation Plan (6 Steps, ~2-3 hours)

### Phase 1: Prepare Current Setup (30 minutes)

#### Step 1.1: Standardize Current Tenant (10 minutes)
```bash
# Rename current setup to follow conventions
mv docker-compose.yml docker-compose.zenithfall.yml
cp .env.example .env.zenithfall

# Update zenithfall environment with current values
echo "TENANT=zenithfall" >> .env.zenithfall
echo "API_PORT=3000" >> .env.zenithfall
echo "WEB_PORT=3001" >> .env.zenithfall
echo "QDRANT_PORT=6333" >> .env.zenithfall
# ... (copy current values)
```

#### Step 1.2: Create Base Templates (10 minutes)
```bash
# Create configuration templates directory
mkdir -p config/templates
mkdir -p config/tiers

# Copy base configuration to template
cp .env.zenithfall config/templates/base.env

# Create tier configurations
cat > config/tiers/basic.env << 'EOF'
TIER=basic
RATE_LIMIT_PER_TENANT=500
MAX_DOCUMENTS=10000
STORAGE_QUOTA_GB=5
EOF
```

#### Step 1.3: Create Tenant Registry (10 minutes)
```bash
mkdir -p tenants
cat > tenants/registry.json << 'EOF'
{
  "tenants": [
    {
      "id": "zenithfall",
      "status": "active",
      "tier": "development",
      "ports": {
        "api": 3000,
        "web": 3001,
        "qdrant": 6333
      }
    }
  ]
}
EOF
```

### Phase 2: Fix and Test Scripts (45 minutes)

#### Step 2.1: Update Create-Tenant Script (20 minutes)

**Required Changes to [`scripts/create-tenant.sh`](../scripts/create-tenant.sh):**

1. **Fix Windows Compatibility**
   ```bash
   # Replace netstat check (line ~89)
   find_available_port() {
       local base_port=$1
       local increment=0

       while [[ $increment -lt 100 ]]; do
           local port=$((base_port + increment * 100))
           # Windows-compatible port check
           if ! netstat -an 2>/dev/null | grep -q ":$port "; then
               echo $port
               return
           fi
           increment=$((increment + 1))
       done
   }
   ```

2. **Update Docker Compose Template Reference**
   ```bash
   # Use the standardized template instead of hardcoded file
   cp docker-compose.zenithfall.yml "docker-compose.$TENANT_ID.yml"
   ```

3. **Fix jq Dependency**
   ```bash
   # Add fallback for systems without jq
   if ! command -v jq &> /dev/null; then
       # Manual JSON append without jq
       python3 -c "
   import json
   import sys

   with open('$REGISTRY_FILE', 'r') as f:
       data = json.load(f)

   data['tenants'].append({
       'id': '$TENANT_ID',
       'status': 'created',
       'tier': '$TIER'
   })

   with open('$REGISTRY_FILE', 'w') as f:
       json.dump(data, f, indent=2)
   "
   fi
   ```

#### Step 2.2: Update Manage-Tenants Script (15 minutes)

**Required Changes to [`scripts/manage-tenants.sh`](../scripts/manage-tenants.sh):**

1. **Fix Source Command**
   ```bash
   # Replace line ~31 in get_tenant_config()
   get_tenant_config() {
       local tenant_id="$1"
       local config_file=".env.$tenant_id"

       if [[ ! -f "$config_file" ]]; then
           log_error "Tenant $tenant_id not found"
           return 1
       fi

       # Windows-safe environment loading
       export $(grep -v '^#' "$config_file" | xargs)
   }
   ```

2. **Fix Container Detection**
   ```bash
   # Update line ~87 for container counting
   local running_containers=$(docker ps --filter "name=${PROJECT_PREFIX:-cw-rag}-${tenant}" --format "{{.Names}}" | wc -l | tr -d ' ')
   ```

#### Step 2.3: Test Scripts (10 minutes)
```bash
# Make scripts executable
chmod +x scripts/create-tenant.sh
chmod +x scripts/manage-tenants.sh

# Test with existing zenithfall setup
./scripts/manage-tenants.sh list
./scripts/manage-tenants.sh status zenithfall
```

### Phase 3: Create Second Tenant (30 minutes)

#### Step 3.1: Create Test Tenant (10 minutes)
```bash
# Create a test tenant
./scripts/create-tenant.sh test-client --tier basic --api-port 3100

# Verify files created
ls -la .env.test-client
ls -la docker-compose.test-client.yml
ls -la scripts/tenants/test-client/
```

#### Step 3.2: Start Test Tenant (10 minutes)
```bash
# Start the new tenant
./scripts/tenants/test-client/start.sh

# Wait for services to be healthy
sleep 30

# Check status
./scripts/manage-tenants.sh status test-client
```

#### Step 3.3: Verify Isolation (10 minutes)
```bash
# Test both tenants are running
curl http://localhost:3000/healthz  # zenithfall
curl http://localhost:3100/healthz  # test-client

# Verify separate networks
docker network ls | grep cw-rag

# Verify separate volumes
docker volume ls | grep cw_rag
```

### Phase 4: Test Cross-Tenant Isolation (30 minutes)

#### Step 4.1: Create Test Documents (15 minutes)
```bash
# Ingest document for zenithfall
curl -X POST http://localhost:3000/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: zenithfall-secure-token-2024" \
  -d '{
    "content": "Zenithfall confidential document",
    "metadata": {
      "tenantId": "zenithfall",
      "docId": "zenith-doc-001",
      "acl": ["zenith-user@example.com"]
    }
  }'

# Ingest document for test-client
curl -X POST http://localhost:3100/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: test-client-secure-token-2024" \
  -d '{
    "content": "Test client confidential document",
    "metadata": {
      "tenantId": "test-client",
      "docId": "test-doc-001",
      "acl": ["test-user@example.com"]
    }
  }'
```

#### Step 4.2: Test Tenant Isolation (15 minutes)
```bash
# Query from zenithfall - should only get zenithfall docs
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "confidential document",
    "userContext": {
      "id": "zenith-user@example.com",
      "tenantId": "zenithfall",
      "groupIds": []
    }
  }'

# Query from test-client - should only get test-client docs
curl -X POST http://localhost:3100/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "confidential document",
    "userContext": {
      "id": "test-user@example.com",
      "tenantId": "test-client",
      "groupIds": []
    }
  }'

# Cross-tenant access test - should return no results
curl -X POST http://localhost:3100/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Zenithfall",
    "userContext": {
      "id": "test-user@example.com",
      "tenantId": "test-client",
      "groupIds": []
    }
  }'
```

### Phase 5: Production Readiness (30 minutes)

#### Step 5.1: Create Production Checklist (10 minutes)
```bash
# Create production deployment checklist
cat > docs/deployment-checklist.md << 'EOF'
# Multi-Tenant Deployment Checklist

## Pre-Deployment
- [ ] Scripts tested with 2+ tenants
- [ ] Cross-tenant isolation verified
- [ ] Backup procedures tested
- [ ] Monitoring configured

## Security Verification
- [ ] Tenant filtering working in all queries
- [ ] RBAC validation active
- [ ] Secure tokens generated
- [ ] Network isolation verified

## Performance Testing
- [ ] Load testing with multiple tenants
- [ ] Resource limits tested
- [ ] Port conflicts resolved
- [ ] Health checks working
EOF
```

#### Step 5.2: Create Management Scripts (10 minutes)
```bash
# Create master control script
cat > scripts/tenant-control.sh << 'EOF'
#!/bin/bash
# Master tenant control script

case "$1" in
    "create")
        ./scripts/create-tenant.sh "$2" --tier "${3:-basic}"
        ;;
    "start-all")
        ./scripts/manage-tenants.sh list | xargs -I {} ./scripts/tenants/{}/start.sh
        ;;
    "stop-all")
        ./scripts/manage-tenants.sh list | xargs -I {} ./scripts/tenants/{}/stop.sh
        ;;
    "health-check")
        ./scripts/manage-tenants.sh health-check
        ;;
    *)
        echo "Usage: $0 {create|start-all|stop-all|health-check}"
        ;;
esac
EOF

chmod +x scripts/tenant-control.sh
```

#### Step 5.3: Update Documentation (10 minutes)
```bash
# Update main README with multi-tenant setup
cat >> README.md << 'EOF'

## Multi-Tenant Setup

This system supports multiple isolated tenants. Each tenant has:
- Separate Docker containers and networks
- Isolated data storage
- Independent configuration
- Secure token-based access

### Quick Start
```bash
# Create new tenant
./scripts/create-tenant.sh your-client --tier premium

# Start tenant
./scripts/tenants/your-client/start.sh

# Check status
./scripts/manage-tenants.sh status your-client
```
EOF
```

### Phase 6: Testing and Validation (15 minutes)

#### Step 6.1: Full System Test (10 minutes)
```bash
# Test complete workflow
./scripts/tenant-control.sh create production-client premium
./scripts/tenant-control.sh health-check
./scripts/manage-tenants.sh backup production-client
```

#### Step 6.2: Performance Validation (5 minutes)
```bash
# Monitor resource usage with multiple tenants
docker stats

# Check for port conflicts
netstat -an | grep -E ":(3000|3100|6333|6433)"

# Verify network isolation
docker network inspect cw-rag-zenithfall-network
docker network inspect cw-rag-test-client-network
```

## Required Code Changes Summary

### Minimal Code Changes Needed:
1. **Fix Windows compatibility in scripts** (port detection, path handling)
2. **Add fallback for jq dependency** (Python script alternative)
3. **Update container detection logic** (Docker filters)
4. **Standardize configuration loading** (safe environment parsing)

### No Application Code Changes Required:
- ✅ Tenant filtering already implemented
- ✅ RBAC already working
- ✅ Docker parameterization ready
- ✅ Shared package structure correct

## Success Criteria

After implementation, you should be able to:

1. ✅ **Create new tenants in under 5 minutes**
2. ✅ **Run multiple tenants simultaneously**
3. ✅ **Update core codebase affecting all tenants**
4. ✅ **Verify complete tenant data isolation**
5. ✅ **Monitor all tenants from single dashboard**

## Estimated Timeline

- **Phase 1-2**: 1.5 hours (setup and script fixes)
- **Phase 3-4**: 1 hour (testing and validation)
- **Phase 5-6**: 30 minutes (production readiness)

**Total: 3 hours to fully operational multi-tenant setup**

## Risk Mitigation

### Low Risk Areas:
- Application code (already multi-tenant ready)
- Data isolation (already implemented)
- Container orchestration (Docker Compose mature)

### Potential Issues:
1. **Port conflicts** → Solved by dynamic allocation
2. **Script compatibility** → Fixed with Windows-safe commands
3. **Configuration drift** → Solved by templating system

## Next Steps

1. Follow Phase 1 to standardize current setup
2. Fix scripts for your environment
3. Create test tenant
4. Validate isolation
5. Deploy additional tenants as needed

**You're 80% there - just need to activate what you already built!**