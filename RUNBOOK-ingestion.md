# Ingestion Layer Operations Runbook

## Table of Contents

1. [Overview](#overview)
2. [Common Failures](#common-failures)
3. [Operational Procedures](#operational-procedures)
4. [Troubleshooting Guides](#troubleshooting-guides)
5. [Tombstone Semantics and Recovery](#tombstone-semantics-and-recovery)
6. [Monitoring and Alerting](#monitoring-and-alerting)
7. [Security Operations](#security-operations)
8. [Emergency Procedures](#emergency-procedures)

## Overview

This runbook provides comprehensive operational guidance for the production-grade ingestion layer. It covers common failure scenarios, troubleshooting procedures, monitoring setup, and security operations.

**Key Components:**
- **API Layer**: [`apps/api/src/routes/ingest/`](apps/api/src/routes/ingest/) - Upload, preview, publish endpoints
- **PII Engine**: [`packages/ingestion-sdk/src/policy.ts`](packages/ingestion-sdk/src/policy.ts) - Policy enforcement and redaction
- **Web Interface**: [`apps/web/src/app/upload/`](apps/web/src/app/upload/) - Manual upload workflow
- **n8n Workflows**: [`n8n/workflows/`](n8n/workflows/) - Automated ingestion pipelines
- **Vector Store**: Qdrant - Document storage and retrieval

## Zenithfall Tenant Configuration

### Phase 0+1 Validated Setup

**Tenant Information:**
- **Tenant ID**: `zenithfall`
- **Embedding Model**: BAAI/bge-small-en-v1.5 (384 dimensions)
- **PII Policy**: OFF (validated working)
- **Authentication Token**: `zenithfall-secure-token-2024`
- **Container Naming**: Mixed (requires standardization)

**Validated Components:**
- ✅ Zenithfall tenant configuration (384-dim, PII OFF)
- ✅ BGE embeddings service (bge-small-en-v1.5)
- ✅ PII detection system (83 tests passed, OFF policy working)
- ✅ Authentication & token system
- ✅ Security hardening (CORS, rate limiting, headers)
- ✅ Obsidian workflow implementation
- ✅ Document processing pipeline

### Environment Configuration

```bash
# Zenithfall Tenant Environment Variables
TENANT_ID=zenithfall
INGEST_TOKEN=zenithfall-secure-token-2024
PII_POLICY=OFF

# Embedding Service Configuration
EMBEDDING_MODEL=bge-small-en-v1.5
VECTOR_DIMENSIONS=384
EMBEDDING_SERVICE_URL=http://localhost:8080

# Qdrant Configuration
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=documents
QDRANT_VECTOR_SIZE=384

# Obsidian Workflow Configuration
OBSIDIAN_VAULT_PATH=/path/to/zenithfall/vault
OBSIDIAN_SYNC_ENABLED=true
OBSIDIAN_INCREMENTAL_SYNC=true
```

### Docker Container Setup

**Current Container Names:**
```bash
# Working containers
cw-rag-zenithfall-embeddings    # ✅ Correct naming
cw-rag-demo-qdrant             # ❌ Should be: cw-rag-zenithfall-qdrant
cw-rag-demo-api                # ❌ Should be: cw-rag-zenithfall-api
```

**Standardization Commands:**
```bash
# Update docker-compose.yml for consistent naming
sed -i 's/cw-rag-demo-/cw-rag-zenithfall-/g' ops/compose/docker-compose.yml

# Restart with standardized names
docker-compose down
docker-compose up --build -d
```

### PII Policy Management

**Zenithfall PII Configuration:**
```typescript
const zenithfallPolicy: PIIPolicy = {
  mode: 'off',
  tenantId: 'zenithfall'
};
```

**Policy Validation:**
```bash
# Test PII OFF policy
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: zenithfall-secure-token-2024" \
  -H "Content-Type: application/json" \
  -d '[{
    "meta": {
      "tenant": "zenithfall",
      "docId": "test-pii-off",
      "source": "manual",
      "sha256": "test",
      "acl": ["public"],
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    },
    "blocks": [{
      "type": "text",
      "text": "Test content with john@example.com and phone 555-123-4567"
    }]
  }]'

# Expected: wouldPublish: true (PII not blocked when policy is OFF)
```

### Token Rotation for Zenithfall

**Current Token**: `zenithfall-secure-token-2024`

**Rotation Procedure:**
```bash
# 1. Generate new zenithfall token
NEW_ZENITHFALL_TOKEN="zenithfall-secure-token-$(date +%Y%m%d)"
echo "New zenithfall token: $NEW_ZENITHFALL_TOKEN"

# 2. Update API configuration
export INGEST_TOKEN="$NEW_ZENITHFALL_TOKEN"
docker-compose restart api

# 3. Update n8n credentials for zenithfall workflows
# Go to n8n UI → Settings → Credentials → "zenithfall-ingest-token"
# Update header value with new token

# 4. Update Obsidian workflow configuration
# Edit n8n/workflows/obsidian-zenithfall.json
# Update HTTP request authentication

# 5. Validate new token
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: $NEW_ZENITHFALL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[]'
```

### Obsidian Zenithfall Vault Setup

**Vault Configuration:**
```bash
# Zenithfall vault structure
/path/to/zenithfall/vault/
├── .obsidian/           # Obsidian configuration (excluded from sync)
├── docs/                # Main documentation
│   ├── architecture/
│   ├── guides/
│   └── troubleshooting/
├── projects/            # Project-specific documents
├── templates/           # Document templates (excluded from sync)
└── archive/             # Archived content
```

**n8n Workflow Setup:**
```javascript
// Zenithfall-specific workflow configuration
const zenithfallConfig = {
  vaultPath: '/path/to/zenithfall/vault',
  tenantId: 'zenithfall',
  includePatterns: [
    'docs/**/*.md',
    'projects/**/*.md'
  ],
  excludePatterns: [
    '.obsidian/**',
    'templates/**',
    '**/.DS_Store'
  ],
  batchSize: 10,
  incrementalSync: true,
  piiPolicy: 'off'
};
```

**Workflow Import Steps:**
1. Import [`n8n/workflows/obsidian-zenithfall.json`](n8n/workflows/obsidian-zenithfall.json)
2. Configure zenithfall credentials in n8n
3. Set environment variables for zenithfall vault
4. Test workflow with small document set
5. Enable automatic scheduling

### Mixed Docker/Local Deployment Troubleshooting

**Common Issues:**

1. **Network Connectivity Between Services:**
```bash
# Check service connectivity
docker exec cw-rag-zenithfall-api ping cw-rag-zenithfall-qdrant
docker exec cw-rag-zenithfall-api curl http://cw-rag-zenithfall-embeddings:8080/health

# If running API locally, update hosts
export QDRANT_HOST=localhost
export EMBEDDING_SERVICE_HOST=localhost
```

2. **Container Name Resolution:**
```bash
# Update /etc/hosts for local development
echo "127.0.0.1 cw-rag-zenithfall-qdrant" >> /etc/hosts
echo "127.0.0.1 cw-rag-zenithfall-embeddings" >> /etc/hosts
```

3. **Port Conflicts:**
```bash
# Check port usage
netstat -tulpn | grep -E ':(3000|6333|8080)'

# Stop conflicting services
sudo lsof -ti:3000 | xargs kill -9
```

4. **Volume Mount Issues:**
```bash
# Verify volume mounts for zenithfall
docker volume ls | grep zenithfall
docker inspect cw-rag-zenithfall-qdrant | jq '.[0].Mounts'

# Fix permissions
sudo chown -R 1000:1000 /var/lib/docker/volumes/zenithfall_qdrant_data/
```

### Infrastructure Validation Commands

**Health Check Suite:**
```bash
#!/bin/bash
# zenithfall-health-check.sh

echo "=== Zenithfall Tenant Health Check ==="

# 1. Qdrant Health
echo "Checking Qdrant..."
QDRANT_STATUS=$(curl -s http://localhost:6333/healthz)
echo "Qdrant: $QDRANT_STATUS"

# 2. Embedding Service Health
echo "Checking BGE Embeddings..."
EMBEDDING_STATUS=$(curl -s http://localhost:8080/health)
echo "Embeddings: $EMBEDDING_STATUS"

# 3. Test embedding generation
echo "Testing embedding generation..."
EMBED_TEST=$(curl -s -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  --data '{"inputs":"zenithfall test"}' | jq '.length')
echo "Embedding dimensions: $EMBED_TEST"

# 4. API connectivity (when available)
echo "Checking API connectivity..."
API_STATUS=$(curl -s http://localhost:3000/healthz 2>/dev/null || echo "API unavailable")
echo "API: $API_STATUS"

# 5. Collection configuration
echo "Checking Qdrant collection..."
COLLECTION_INFO=$(curl -s http://localhost:6333/collections/documents 2>/dev/null || echo "Collection not found")
echo "Collection: $COLLECTION_INFO"
```

### Performance Monitoring for Zenithfall

**Key Metrics:**
```bash
# Document processing rate for zenithfall
curl -s "http://localhost:3001/api/ingest/ingests?tenant=zenithfall&dateFrom=$(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | jq '.pagination.total'

# Embedding service response time
time curl -s -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  --data '{"inputs":"zenithfall performance test"}'

# Qdrant query performance
time curl -s -X POST http://localhost:6333/collections/documents/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, 0.4],
    "limit": 10,
    "filter": {
      "must": [{"key": "tenant", "match": {"value": "zenithfall"}}]
    }
  }'
```

## Common Failures

### 401 Token Authentication Errors

**Symptoms:**
- HTTP 401 responses from ingestion endpoints
- n8n workflow failures with authentication errors
- Manual uploads rejected with "Invalid or missing x-ingest-token"

**Root Causes:**
1. **Missing Token**: No `x-ingest-token` header provided
2. **Invalid Token**: Token doesn't match configured `INGEST_TOKEN`
3. **Expired Token**: Token rotation not properly applied
4. **Case Sensitivity**: Header name case mismatch

**Resolution Steps:**

```bash
# 1. Verify current token configuration
docker exec -it api-container env | grep INGEST_TOKEN

# 2. Check n8n credential configuration
# Go to n8n UI → Settings → Credentials → "ingest-token"
# Verify header name: x-ingest-token
# Verify header value matches INGEST_TOKEN

# 3. Test token validity
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '[]'

# 4. Check API logs for authentication attempts
docker logs api-container | grep -i "401\|unauthorized\|ingest-token"
```

**Prevention:**
- Implement token validation in deployment scripts
- Use environment variable validation on service startup
- Document token rotation procedures

### Blocked by Policy Scenarios

**Symptoms:**
- Documents shown as "blocked" in publish results
- Preview endpoint returns `wouldPublish: false`
- PII findings reported in response summaries

**Root Causes:**
1. **Overly Restrictive Policy**: `mode: 'block'` with sensitive content
2. **Allowlist Misconfiguration**: Missing required PII types in allowlist
3. **Source Override Issues**: Incorrect path patterns in policy overrides
4. **False Positives**: PII detection triggering on non-sensitive content

**Diagnosis Steps:**

```bash
# 1. Check policy configuration for tenant
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"meta":{"tenant":"TENANT_ID","docId":"test"},"blocks":[]}]'

# 2. Review PII findings in response
# Look for "findings" array with type and count information

# 3. Test with PII policy adjustments
# Temporarily switch to 'mask' mode for testing:
# Policy: { "mode": "mask", "tenantId": "TENANT_ID" }
```

**Resolution Options:**

1. **Policy Adjustment**:
   ```typescript
   // Change from 'block' to 'mask' mode
   const policy = {
     mode: 'mask',  // Changed from 'block'
     tenantId: 'your-tenant'
   };
   ```

2. **Source Override**:
   ```typescript
   // Add path-specific exception
   const policy = {
     mode: 'block',
     tenantId: 'your-tenant',
     sourceOverrides: {
       'trusted-docs/*': { mode: 'off' },
       'internal/*': { mode: 'mask' }
     }
   };
   ```

3. **Allowlist Configuration**:
   ```typescript
   // Allow specific PII types
   const policy = {
     mode: 'allowlist',
     allowedTypes: ['email', 'phone'],
     tenantId: 'your-tenant'
   };
   ```

### Dedupe No-op Situations

**Symptoms:**
- Documents return status `updated` instead of `published`
- `pointsUpserted: 0` in publish results
- Message: "Document already exists with same content hash"

**When This Occurs:**
1. **Identical Content**: Same document re-ingested without changes
2. **Hash Collision**: Different content producing same SHA256 (extremely rare)
3. **Failed Cleanup**: Previous ingestion partially completed, leaving stale entries

**Diagnosis:**

```bash
# 1. Check for existing document in Qdrant
curl -X POST http://localhost:6334/collections/documents/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.0, 0.0, ...],  // Dummy vector
    "limit": 10,
    "filter": {
      "must": [
        {"key": "tenant", "match": {"value": "YOUR_TENANT"}},
        {"key": "docId", "match": {"value": "YOUR_DOC_ID"}}
      ]
    }
  }'

# 2. Verify content hash calculation
# Use normalization utility to recalculate hash
```

**Force Refresh Procedures:**

1. **Delete Existing Points** (Use with caution):
   ```bash
   # Delete specific document points
   curl -X POST http://localhost:6334/collections/documents/points/delete \
     -H "Content-Type: application/json" \
     -d '{
       "filter": {
         "must": [
           {"key": "tenant", "match": {"value": "YOUR_TENANT"}},
           {"key": "docId", "match": {"value": "YOUR_DOC_ID"}}
         ]
       }
     }'
   ```

2. **Tombstone and Re-ingest**:
   ```bash
   # 1. Create tombstone document
   curl -X POST http://localhost:3000/ingest/publish \
     -H "x-ingest-token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{
       "meta": {
         "tenant": "YOUR_TENANT",
         "docId": "YOUR_DOC_ID",
         "deleted": true,
         "sha256": "tombstone",
         "acl": ["system"],
         "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
       },
       "blocks": []
     }]'

   # 2. Re-ingest with new content
   ```

### Qdrant Connection Issues

**Symptoms:**
- API `/readyz` endpoint returns "not connected"
- 500 errors during document ingestion
- Timeout errors in n8n workflows

**Common Causes:**
1. **Network Connectivity**: Qdrant container down or unreachable
2. **Capacity Issues**: Qdrant out of disk space or memory
3. **Index Problems**: Collection corrupted or misconfigured
4. **Version Incompatibility**: API client/server version mismatch

**Diagnosis Steps:**

```bash
# 1. Check Qdrant container status
docker ps | grep qdrant
docker logs qdrant-container

# 2. Test direct Qdrant connectivity
curl http://localhost:6334/health
curl http://localhost:6334/collections

# 3. Check collection status
curl http://localhost:6334/collections/documents

# 4. Verify API can connect
curl http://localhost:3000/readyz
```

**Resolution Steps:**

1. **Restart Qdrant Service**:
   ```bash
   docker-compose restart qdrant
   # Wait for service to be healthy
   sleep 30
   curl http://localhost:6334/health
   ```

2. **Check Disk Space**:
   ```bash
   docker exec qdrant-container df -h
   # If disk full, clean up old data or expand volume
   ```

3. **Recreate Collection** (Data loss warning):
   ```bash
   # Delete existing collection
   curl -X DELETE http://localhost:6334/collections/documents

   # Recreate with proper configuration
   curl -X PUT http://localhost:6334/collections/documents \
     -H "Content-Type: application/json" \
     -d '{
       "vectors": {
         "size": 384,
         "distance": "Cosine"
       }
     }'
   ```

### n8n Workflow Failures

**Symptoms:**
- Workflow executions showing "ERROR" status
- Incomplete document processing
- Timeout errors in HTTP request nodes

**Common Issues:**

1. **Configuration Errors**:
   ```bash
   # Check environment variables
   docker exec n8n-container env | grep -E "(API_URL|INGEST_TOKEN|TENANT_ID)"

   # Verify credential configuration
   # n8n UI → Settings → Credentials → Check "ingest-token"
   ```

2. **Network Timeouts**:
   ```json
   // Increase timeout in HTTP Request nodes
   {
     "options": {
       "timeout": 60000,  // 60 seconds
       "retry": {
         "enabled": true,
         "maxTries": 3,
         "waitBetween": 2000
       }
     }
   }
   ```

3. **Memory Issues with Large Batches**:
   ```javascript
   // Reduce batch size in workflow configuration
   const config = {
     batchSize: 5,  // Reduced from 10 or 20
     maxRows: 100   // Reduced from 1000
   };
   ```

**Debugging Steps:**

1. **Review Execution Logs**:
   - Go to n8n UI → Executions
   - Click on failed execution
   - Review each node's input/output
   - Check error details

2. **Test Individual Nodes**:
   - Use "Execute Node" feature
   - Test HTTP requests independently
   - Verify data transformations

3. **Manual Workflow Testing**:
   ```bash
   # Test API endpoints manually
   curl -X POST http://localhost:3000/ingest/preview \
     -H "x-ingest-token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{sample document}]'
   ```

## Operational Procedures

### Token Rotation

**Schedule**: Rotate ingestion tokens every 90 days or immediately if compromise suspected.

**Pre-rotation Checklist:**
- [ ] Identify all systems using current token
- [ ] Prepare new token value (use strong random generator)
- [ ] Schedule maintenance window for token updates
- [ ] Verify rollback procedures

**Rotation Steps:**

1. **Generate New Token**:
   ```bash
   # Generate cryptographically secure token
   NEW_TOKEN=$(openssl rand -hex 32)
   echo "New token: $NEW_TOKEN"
   ```

2. **Update API Configuration**:
   ```bash
   # Update docker-compose environment
   # Edit ops/compose/docker-compose.yml
   # Update INGEST_TOKEN environment variable

   # Restart API service
   docker-compose restart api
   ```

3. **Update n8n Credentials**:
   - Go to n8n UI → Settings → Credentials
   - Edit "ingest-token" credential
   - Update header value with new token
   - Save changes

4. **Update External Systems**:
   ```bash
   # Update any external scripts or applications
   # Update CI/CD pipeline variables
   # Update monitoring system configurations
   ```

5. **Validation**:
   ```bash
   # Test with new token
   curl -X POST http://localhost:3000/ingest/preview \
     -H "x-ingest-token: $NEW_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[]'

   # Verify old token is rejected
   curl -X POST http://localhost:3000/ingest/preview \
     -H "x-ingest-token: OLD_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[]'
   # Should return 401
   ```

### n8n Execution History Pruning

**Schedule**: Prune execution history monthly to manage disk usage.

**Steps:**

1. **Check Current Usage**:
   ```bash
   # Check n8n database size
   docker exec n8n-container du -sh /home/node/.n8n/

   # Count executions
   # n8n UI → Settings → Log Level → Check execution count
   ```

2. **Configure Automatic Pruning**:
   ```bash
   # Set environment variables for n8n container
   N8N_EXECUTIONS_DATA_PRUNE=true
   N8N_EXECUTIONS_DATA_MAX_AGE=168  # 7 days in hours
   N8N_EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000
   ```

3. **Manual Pruning** (if needed):
   ```bash
   # Access n8n container
   docker exec -it n8n-container sh

   # Use n8n CLI to prune executions
   n8n db:prune --deleteCount=1000 --olderThan=7
   ```

### Reprocessing Specific Paths/Tables

**Use Cases:**
- Schema changes requiring reprocessing
- PII policy updates affecting existing documents
- Corruption recovery
- Data migration

**Procedure:**

1. **Identify Target Documents**:
   ```bash
   # For Obsidian paths
   REPROCESS_PATH="docs/troubleshooting/*"

   # For database tables
   REPROCESS_TABLE="public.documents"
   REPROCESS_FILTER="category = 'user-guides'"
   ```

2. **Create Reprocessing Workflow**:
   ```javascript
   // n8n workflow modification
   const config = {
     // Force reprocessing by ignoring timestamps
     incrementalSync: false,

     // Override path filters
     includePattern: "docs/troubleshooting/*",

     // Force overwrite existing documents
     forceUpdate: true
   };
   ```

3. **Manual Override Procedure**:
   ```bash
   # 1. Create tombstones for existing documents
   curl -X POST http://localhost:3000/ingest/publish \
     -H "x-ingest-token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{
       "meta": {
         "tenant": "YOUR_TENANT",
         "docId": "docs/troubleshooting/guide-1",
         "deleted": true,
         "sha256": "tombstone",
         "acl": ["system"],
         "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
       },
       "blocks": []
     }]'

   # 2. Re-ingest with updated content
   # Use normal ingestion workflow
   ```

### Performance Monitoring

**Key Metrics to Track:**

1. **Ingestion Rate**:
   ```bash
   # Documents per hour
   # Measured via audit logs or Qdrant point count changes
   ```

2. **Error Rates**:
   ```bash
   # Authentication failures
   # PII policy blocks
   # Qdrant connection errors
   # Processing timeouts
   ```

3. **Resource Utilization**:
   ```bash
   # CPU usage during batch processing
   # Memory consumption in n8n workflows
   # Qdrant disk usage growth
   # Network bandwidth for large uploads
   ```

**Monitoring Commands:**

```bash
# Check API health and performance
curl -w "@curl-format.txt" http://localhost:3000/healthz

# Monitor Qdrant collection size
curl http://localhost:6334/collections/documents | jq '.result.points_count'

# Check recent ingestion activity
curl http://localhost:3001/api/ingest/ingests | jq '.records[0:5]'

# n8n workflow execution statistics
# Available through n8n UI → Executions → Statistics
```

## Troubleshooting Guides

### Debugging PII Policy Violations

**Step 1: Identify Violation Type**

```bash
# Get detailed PII findings
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{YOUR_DOCUMENT}]' | jq '.findings'

# Example response:
# [
#   {"type": "email", "count": 3},
#   {"type": "phone", "count": 1},
#   {"type": "credit_card", "count": 1}
# ]
```

**Step 2: Analyze Content Patterns**

```typescript
// Test individual PII detectors
import { defaultDetectorRegistry } from '@cw-rag-core/ingestion-sdk';

const emailDetector = defaultDetectorRegistry.getDetector('email');
const detections = emailDetector.detect(sampleText);
console.log('Email detections:', detections);
```

**Step 3: Policy Adjustment Options**

1. **False Positive Handling**:
   ```typescript
   // Add source-specific override for false positives
   const policy = {
     mode: 'mask',
     sourceOverrides: {
       'technical-docs/*': {
         mode: 'allowlist',
         allowedTypes: ['email']  // Allow emails in technical docs
       }
     }
   };
   ```

2. **Content Modification**:
   ```bash
   # Replace problematic patterns before ingestion
   # Example: Replace example emails with placeholders
   sed 's/user@example\.com/\[EXAMPLE_EMAIL\]/g' document.md
   ```

### Investigating Failed Document Ingestion

**Common Failure Points:**

1. **Validation Failures**:
   ```bash
   # Check document structure
   curl -X POST http://localhost:3000/ingest/preview \
     -H "x-ingest-token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{YOUR_DOCUMENT}]'

   # Look for validation errors in response
   ```

2. **Content Processing Issues**:
   ```bash
   # Check file format support
   SUPPORTED_TYPES="pdf,docx,md,html,txt"
   FILE_EXT=$(echo "filename.pdf" | cut -d. -f2)

   if [[ ,$SUPPORTED_TYPES, != *,$FILE_EXT,* ]]; then
     echo "Unsupported file type: $FILE_EXT"
   fi
   ```

3. **Size Limit Violations**:
   ```bash
   # Check file size (10MB limit)
   MAX_SIZE=10485760  # 10MB in bytes
   FILE_SIZE=$(stat -c%s "document.pdf")

   if [ $FILE_SIZE -gt $MAX_SIZE ]; then
     echo "File too large: $FILE_SIZE bytes (max: $MAX_SIZE)"
   fi
   ```

**Diagnosis Workflow:**

```bash
# 1. Test with minimal document
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{
    "meta": {
      "tenant": "test",
      "docId": "minimal-test",
      "source": "manual",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "acl": ["public"],
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    },
    "blocks": [{"type": "text", "text": "Test content"}]
  }]'

# 2. Gradually add complexity
# - Add more metadata fields
# - Add multiple blocks
# - Test with actual content

# 3. Check API logs for detailed errors
docker logs api-container | tail -50
```

### Resolving Qdrant Vector Store Issues

**Collection Health Check**:

```bash
# 1. Verify collection exists and is healthy
curl http://localhost:6334/collections/documents

# 2. Check collection configuration
curl http://localhost:6334/collections/documents | jq '{
  name: .result.collection_name,
  status: .result.status,
  points: .result.points_count,
  config: .result.config
}'

# 3. Verify vector dimensions
curl http://localhost:6334/collections/documents | \
  jq '.result.config.params.vectors.size'
# Should match embedding model dimensions (384 for sentence-transformers)
```

**Performance Issues**:

```bash
# 1. Check index build status
curl http://localhost:6334/collections/documents | \
  jq '.result.optimizer_status'

# 2. Monitor query performance
curl -X POST http://localhost:6334/collections/documents/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, ...],  // 384-dimensional vector
    "limit": 10,
    "with_payload": false
  }' \
  -w "Total time: %{time_total}s\n"
```

**Data Corruption Recovery**:

```bash
# 1. Create collection backup (if possible)
curl -X POST http://localhost:6334/collections/documents/snapshots
# Note snapshot name from response

# 2. Verify data integrity
curl -X POST http://localhost:6334/collections/documents/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}' | jq '.result.points | length'

# 3. If corruption detected, restore from backup
# Or recreate collection and re-ingest data
```

### n8n Workflow Debugging Techniques

**Workflow Execution Analysis**:

1. **Enable Debug Mode**:
   ```javascript
   // Add debug logging to workflow functions
   console.log('Debug: Processing batch', batchNumber);
   console.log('Debug: Document count', documents.length);
   console.log('Debug: Current config', JSON.stringify(config, null, 2));
   ```

2. **Node-by-Node Testing**:
   - Use "Execute Node" feature in n8n UI
   - Test with minimal data sets
   - Verify data transformations at each step

3. **HTTP Request Debugging**:
   ```javascript
   // Add response logging in HTTP nodes
   const response = $json;
   console.log('API Response:', JSON.stringify(response, null, 2));

   if (response.error) {
     console.error('API Error:', response.error);
   }
   ```

**Common n8n Issues**:

1. **Memory Exhaustion**:
   ```bash
   # Monitor n8n container memory
   docker stats n8n-container

   # Reduce batch sizes in workflows
   # Split large operations into smaller chunks
   ```

2. **Network Timeouts**:
   ```javascript
   // Increase timeout values
   const httpOptions = {
     timeout: 120000,  // 2 minutes
     retry: {
       enabled: true,
       maxTries: 3,
       waitBetween: 5000
     }
   };
   ```

3. **Data Processing Errors**:
   ```javascript
   // Add error handling to function nodes
   try {
     // Process data
     return processedData;
   } catch (error) {
     console.error('Processing error:', error.message);
     return {
       _error: true,
       _errorMessage: error.message,
       _originalData: $json
     };
   }
   ```

## Tombstone Semantics and Recovery

### When Tombstones Are Created

**Automatic Tombstone Creation**:

1. **File Deletion Detection** (Obsidian workflow):
   ```javascript
   // When files are removed from vault
   const deletedFiles = previousFiles.filter(file =>
     !currentFiles.includes(file)
   );
   ```

2. **Database Soft Deletes** (Postgres workflow):
   ```sql
   -- When deleted_at column is set
   UPDATE documents
   SET deleted_at = NOW()
   WHERE id = 'document-id';
   ```

3. **Manual Deletion Requests**:
   ```json
   {
     "meta": {
       "tenant": "acme-corp",
       "docId": "obsolete-doc",
       "deleted": true,
       "sha256": "tombstone",
       "acl": ["system"],
       "timestamp": "2024-01-15T10:30:00.000Z"
     },
     "blocks": []
   }
   ```

### Document Recovery Procedures

**Recovery from Accidental Deletion**:

1. **Identify Deletion Event**:
   ```bash
   # Check audit logs for deletion
   curl http://localhost:3001/api/ingest/ingests?action=tombstone

   # Find specific document
   curl "http://localhost:3001/api/ingest/ingests?docId=DOCUMENT_ID"
   ```

2. **Restore from Source**:
   ```bash
   # For file-based sources (Obsidian)
   # Restore file to original location
   # Re-run sync workflow

   # For database sources
   # Un-delete record in source database
   UPDATE documents
   SET deleted_at = NULL
   WHERE id = 'document-id';
   ```

3. **Manual Document Restoration**:
   ```bash
   # Re-ingest document with original content
   curl -X POST http://localhost:3000/ingest/publish \
     -H "x-ingest-token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{
       "meta": {
         "tenant": "acme-corp",
         "docId": "recovered-doc",
         "source": "manual-recovery",
         "sha256": "NEW_CONTENT_HASH",
         "acl": ["public"],
         "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
         "deleted": false
       },
       "blocks": [
         {"type": "text", "text": "Restored content..."}
       ]
     }]'
   ```

### Tombstone Cleanup Procedures

**Scheduled Cleanup**:

```bash
# Remove tombstone entries older than 90 days
curl -X POST http://localhost:6334/collections/documents/points/delete \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "must": [
        {"key": "deleted", "match": {"value": true}},
        {"key": "timestamp", "range": {
          "lt": "'$(date -d '90 days ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
        }}
      ]
    }
  }'
```

**Audit Trail Preservation**:

```bash
# Archive tombstone audit records before cleanup
curl "http://localhost:3001/api/ingest/ingests?action=tombstone&dateTo=$(date -d '90 days ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
  > tombstone_archive_$(date +%Y%m%d).json
```

### Data Recovery from Backups

**Qdrant Snapshot Recovery**:

```bash
# 1. List available snapshots
curl http://localhost:6334/collections/documents/snapshots

# 2. Create current snapshot before recovery
curl -X POST http://localhost:6334/collections/documents/snapshots

# 3. Restore from specific snapshot
curl -X PUT http://localhost:6334/collections/documents/snapshots/SNAPSHOT_NAME/recover
```

**Database Backup Recovery**:

```bash
# For PostgreSQL sources
pg_dump -h postgres-host -U username database_name > backup.sql

# Restore specific tables
pg_restore -h postgres-host -U username -t documents backup.sql
```

## Monitoring and Alerting

### Key Metrics to Monitor

**Ingestion Performance Metrics**:

```bash
# Documents processed per hour
DOCS_PER_HOUR=$(curl -s "http://localhost:3001/api/ingest/ingests?dateFrom=$(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | jq '.pagination.total')

# Average processing time per document
# Calculate from ingestion timestamps

# Queue depth (pending documents)
# Monitor n8n workflow execution queue
```

**Error Rate Metrics**:

```bash
# Authentication failure rate
AUTH_FAILURES=$(curl -s "http://localhost:3001/api/ingest/ingests?dateFrom=$(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | jq '[.records[] | select(.status == "error" and (.error | contains("401")))] | length')

# PII policy violation rate
PII_BLOCKS=$(curl -s "http://localhost:3001/api/ingest/ingests?action=block" | jq '.pagination.total')

# Processing error rate
PROCESSING_ERRORS=$(curl -s "http://localhost:3001/api/ingest/ingests?status=error" | jq '.pagination.total')
```

**Resource Utilization Metrics**:

```bash
# Qdrant storage usage
QDRANT_STORAGE=$(curl -s http://localhost:6334/collections/documents | jq '.result.points_count')

# API response times
curl -w "@curl-format.txt" -s http://localhost:3000/healthz

# n8n workflow execution times
# Monitor through n8n UI or API
```

### Setting Up Alerts

**Prometheus/Grafana Configuration**:

```yaml
# prometheus.yml
- job_name: 'ingestion-api'
  static_configs:
    - targets: ['api:3000']
  metrics_path: '/metrics'

- job_name: 'qdrant'
  static_configs:
    - targets: ['qdrant:6334']
  metrics_path: '/metrics'
```

**Alert Rules**:

```yaml
# alerting.yml
groups:
  - name: ingestion.rules
    rules:
      - alert: HighAuthenticationFailureRate
        expr: rate(ingestion_auth_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate detected"

      - alert: QdrantConnectionDown
        expr: up{job="qdrant"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Qdrant vector database is down"

      - alert: HighPIIViolationRate
        expr: rate(ingestion_pii_blocks_total[1h]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Unusual number of PII policy violations"
```

**Custom Health Checks**:

```bash
#!/bin/bash
# health-check.sh

# Check API health
API_STATUS=$(curl -s http://localhost:3000/healthz | jq -r '.status')
if [ "$API_STATUS" != "ok" ]; then
  echo "CRITICAL: API health check failed"
  exit 2
fi

# Check Qdrant connectivity
QDRANT_STATUS=$(curl -s http://localhost:3000/readyz | jq -r '.qdrant')
if [ "$QDRANT_STATUS" != "connected" ]; then
  echo "CRITICAL: Qdrant connection failed"
  exit 2
fi

# Check recent ingestion activity
RECENT_INGESTS=$(curl -s "http://localhost:3001/api/ingest/ingests?dateFrom=$(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | jq '.records | length')
if [ "$RECENT_INGESTS" -eq 0 ]; then
  echo "WARNING: No ingestion activity in the last hour"
  exit 1
fi

echo "OK: All health checks passed"
exit 0
```

### Log Analysis and Troubleshooting

**Centralized Logging Setup**:

```yaml
# docker-compose.yml logging configuration
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
        labels: "service=ingestion-api"

  qdrant:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
        labels: "service=qdrant"
```

**Log Analysis Scripts**:

```bash
#!/bin/bash
# analyze-logs.sh

# Authentication failures
echo "=== Authentication Failures ==="
docker logs api-container 2>&1 | grep -i "401\|unauthorized" | tail -10

# PII policy violations
echo "=== PII Policy Violations ==="
docker logs api-container 2>&1 | grep -i "blocked.*pii" | tail -10

# Qdrant connection issues
echo "=== Qdrant Connection Issues ==="
docker logs api-container 2>&1 | grep -i "qdrant.*error" | tail -10

# n8n workflow failures
echo "=== n8n Workflow Failures ==="
docker logs n8n-container 2>&1 | grep -i "error\|failed" | tail -10

# Performance issues (slow responses)
echo "=== Performance Issues ==="
docker logs api-container 2>&1 | grep -E "took [0-9]{4,}ms" | tail -5
```

### Performance Optimization Guidelines

**Batch Size Optimization**:

```javascript
// n8n workflow optimization
const config = {
  // Start with small batches, increase gradually
  batchSize: 10,

  // Monitor processing time per batch
  maxProcessingTime: 30000,  // 30 seconds

  // Adjust based on content size
  maxBatchSizeBytes: 10 * 1024 * 1024  // 10MB
};

// Dynamic batch sizing
if (averageDocSize > 100000) {  // 100KB
  config.batchSize = 5;
} else if (averageDocSize < 10000) {  // 10KB
  config.batchSize = 20;
}
```

**Qdrant Performance Tuning**:

```bash
# Optimize collection configuration
curl -X PATCH http://localhost:6334/collections/documents \
  -H "Content-Type: application/json" \
  -d '{
    "optimizer_config": {
      "default_segment_number": 4,
      "max_segment_size": 20000000,
      "memmap_threshold": 20000000,
      "indexing_threshold": 10000
    }
  }'

# Monitor memory usage
curl http://localhost:6334/metrics | grep memory
```

## Security Operations

### Token Management Best Practices

**Token Generation**:

```bash
# Generate cryptographically secure tokens
openssl rand -hex 32

# Alternative using /dev/urandom
head -c 32 /dev/urandom | base64

# Verify token entropy
echo "YOUR_TOKEN" | wc -c  # Should be 64+ characters for hex
```

**Token Storage Security**:

```bash
# Use environment variables, never hardcode
export INGEST_TOKEN="your-secure-token"

# Restrict file permissions for .env files
chmod 600 .env
chown root:root .env

# Use Docker secrets in production
echo "your-secure-token" | docker secret create ingest_token -
```

**Token Audit Trail**:

```bash
# Log all token usage
# API logs should include:
# - Token hash (not full value)
# - Source IP
# - Request timestamp
# - Request type

# Example log format:
# {"level":"info","msg":"token_auth","token_hash":"abc123","ip":"10.0.0.1","endpoint":"/ingest/publish"}
```

### PII Incident Response Procedures

**Incident Classification**:

1. **Level 1 - Policy Violation**: PII detected and properly handled by policy
2. **Level 2 - Exposure Risk**: PII potentially stored or logged inappropriately
3. **Level 3 - Data Breach**: Confirmed PII exposure to unauthorized parties

**Response Procedures**:

**Level 1 Response** (Policy Violation):
```bash
# 1. Verify policy is working correctly
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{sample_document_with_pii}]'

# 2. Review findings
# Ensure appropriate PII types are detected
# Verify masking/blocking is applied

# 3. Document incident
echo "$(date): PII policy violation - ${PII_TYPE} detected and handled" >> pii_incidents.log
```

**Level 2 Response** (Exposure Risk):
```bash
# 1. Immediate containment
# Stop affected workflows
docker-compose stop n8n

# Review recent ingestions
curl "http://localhost:3001/api/ingest/ingests?dateFrom=$(date -d '24 hours ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)"

# 2. Audit log analysis
grep -i "pii\|personal\|sensitive" /var/log/ingestion/*.log

# 3. Vector store cleanup
# Identify and remove affected documents
curl -X POST http://localhost:6334/collections/documents/points/delete \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "must": [
        {"key": "tenant", "match": {"value": "affected_tenant"}},
        {"key": "timestamp", "range": {
          "gte": "2024-01-15T00:00:00Z",
          "lte": "2024-01-15T23:59:59Z"
        }}
      ]
    }
  }'
```

**Level 3 Response** (Data Breach):
```bash
# 1. Immediate system isolation
docker-compose down

# 2. Preserve evidence
tar -czf incident_evidence_$(date +%Y%m%d_%H%M%S).tar.gz \
  /var/log/ingestion/ \
  /var/lib/docker/volumes/qdrant_data/ \
  .env

# 3. Notify stakeholders
# Follow organizational breach notification procedures

# 4. Forensic analysis
# Engage security team or external forensics
```

### Audit Log Analysis

**Audit Log Format**:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "action": "publish|preview|block|tombstone|error",
  "tenant": "acme-corp",
  "docId": "user-manual-v2",
  "source": "obsidian",
  "version": "2.0",
  "status": "success|blocked|error",
  "piiFindings": [
    {"type": "email", "count": 2}
  ],
  "ipAddress": "10.0.0.15",
  "userAgent": "n8n/1.0",
  "processingTime": 1250
}
```

**Audit Queries**:

```bash
# Recent PII violations by tenant
curl "http://localhost:3001/api/ingest/ingests?action=block&tenant=acme-corp" | \
  jq '.records[] | {time, docId, piiSummary}'

# Authentication failure patterns
curl "http://localhost:3001/api/ingest/ingests?status=error" | \
  jq '.records[] | select(.error | contains("401")) | {time, source, ipAddress}'

# High-volume ingestion periods
curl "http://localhost:3001/api/ingest/ingests?dateFrom=$(date -d '7 days ago' -u +%Y-%m-%dT%H:%M:%S.%3NZ)" | \
  jq '.records | group_by(.time | split("T")[0]) | map({date: .[0].time | split("T")[0], count: length})'

# Document lifecycle tracking
curl "http://localhost:3001/api/ingest/ingests?docId=specific-document" | \
  jq '.records | sort_by(.time) | .[] | {time, action, status}'
```

### Compliance Verification Steps

**GDPR Compliance Checks**:

```bash
# 1. Right to erasure verification
# Confirm tombstone creation for deletion requests
curl "http://localhost:3001/api/ingest/ingests?action=tombstone&docId=gdpr-deletion-request"

# 2. Data processing lawfulness
# Verify consent-based ACL enforcement
curl "http://localhost:3001/api/ingest/ingests" | \
  jq '.records[] | select(.meta.acl | contains(["consent-withdrawn"]) | not)'

# 3. Data minimization compliance
# Check PII policy enforcement
curl "http://localhost:3001/api/ingest/ingests?action=block" | \
  jq '.records | length'
```

**SOC 2 Compliance Checks**:

```bash
# 1. Access logging verification
# Ensure all access attempts are logged
grep "ingest.*auth" /var/log/ingestion/api.log | wc -l

# 2. Encryption verification
# Confirm HTTPS usage
curl -I https://your-domain.com/ingest/healthz | grep "HTTP/2 200"

# 3. Data integrity verification
# Check document hash validation
curl "http://localhost:3001/api/ingest/ingests" | \
  jq '.records[] | select(.meta.sha256 == null or .meta.sha256 == "")'
```

## Emergency Procedures

### Complete System Recovery

**Recovery from Total Failure**:

```bash
# 1. Stop all services
docker-compose down

# 2. Check data integrity
docker volume ls | grep qdrant
docker volume ls | grep n8n

# 3. Restore from backups (if available)
# Restore Qdrant data
docker run --rm -v qdrant_data:/data -v /backup:/backup \
  alpine cp -r /backup/qdrant_latest /data

# Restore n8n data
docker run --rm -v n8n_data:/data -v /backup:/backup \
  alpine cp -r /backup/n8n_latest /data

# 4. Start services with health checks
docker-compose up -d
sleep 30

# 5. Verify service health
curl http://localhost:3000/healthz
curl http://localhost:6334/health
curl http://localhost:5678/healthz
```

**Data Corruption Recovery**:

```bash
# 1. Identify corruption scope
curl http://localhost:6334/collections/documents | jq '.result.status'

# 2. Create emergency backup
curl -X POST http://localhost:6334/collections/documents/snapshots

# 3. Rebuild collection if necessary
curl -X DELETE http://localhost:6334/collections/documents

curl -X PUT http://localhost:6334/collections/documents \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {"size": 384, "distance": "Cosine"},
    "optimizers_config": {
      "default_segment_number": 2,
      "max_segment_size": 20000000
    }
  }'

# 4. Re-ingest critical documents
# Use manual upload or trigger full sync workflows
```

### Rollback Procedures

**Configuration Rollback**:

```bash
# 1. Backup current configuration
cp docker-compose.yml docker-compose.yml.backup
cp .env .env.backup

# 2. Restore previous configuration
git checkout HEAD~1 -- docker-compose.yml .env

# 3. Restart with previous configuration
docker-compose down
docker-compose up -d

# 4. Verify rollback success
curl http://localhost:3000/healthz
```

**Token Rollback** (in case of rotation issues):

```bash
# 1. Update API with previous token
export INGEST_TOKEN="previous-token-value"
docker-compose restart api

# 2. Update n8n credentials
# Go to n8n UI → Settings → Credentials
# Restore previous token value

# 3. Verify old token works
curl -X POST http://localhost:3000/ingest/preview \
  -H "x-ingest-token: previous-token-value" \
  -H "Content-Type: application/json" \
  -d '[]'
```

### Emergency Contacts and Escalation

**Escalation Matrix**:

1. **Level 1 - Operational Issues**:
   - Platform team on-call
   - Response time: 30 minutes
   - Issues: Service downtime, performance degradation

2. **Level 2 - Security Incidents**:
   - Security team lead
   - Response time: 15 minutes
   - Issues: PII exposure, unauthorized access

3. **Level 3 - Data Breach**:
   - CISO and legal team
   - Response time: Immediate
   - Issues: Confirmed data exposure, compliance violations

**Emergency Runbook Checklist**:

- [ ] Identify incident severity level
- [ ] Execute appropriate response procedures
- [ ] Document all actions taken
- [ ] Preserve evidence if security-related
- [ ] Notify stakeholders per escalation matrix
- [ ] Conduct post-incident review
- [ ] Update procedures based on lessons learned

---

*This runbook should be reviewed quarterly and updated as the system evolves. All procedures should be tested in a staging environment before production use.*