# New Tenant Setup Guide

## Overview

This guide walks through the process of onboarding a new tenant to the cw-rag-core multi-tenant RAG system. Each tenant gets their own isolated Docker stack while sharing the core codebase.

## Prerequisites

- Docker and Docker Compose installed
- Access to the cw-rag-core repository
- Unique tenant identifier (e.g., "acme-corp", "client-xyz")

## Step 1: Prepare Tenant Configuration

### 1.1 Create Tenant-Specific Environment File

Create a new environment file for your tenant:

```bash
# Copy the example environment file
cp .env.example .env.acme-corp

# Edit with tenant-specific values
nano .env.acme-corp
```

### 1.2 Configure Tenant Variables

```bash
# .env.acme-corp

# Tenant Identity
TENANT=acme-corp
PROJECT_PREFIX=cw-rag

# Port Configuration (unique per tenant to avoid conflicts)
API_PORT=3100          # Default: 3000
WEB_PORT=3101          # Default: 3001
QDRANT_PORT=6433       # Default: 6333
QDRANT_GRPC_PORT=6434  # Default: 6334
N8N_PORT=5778          # Default: 5678

# Container Names (unique per tenant)
API_CONTAINER_NAME=cw-rag-acme-corp-api
WEB_CONTAINER_NAME=cw-rag-acme-corp-web
QDRANT_CONTAINER_NAME=cw-rag-acme-corp-qdrant

# Volume Names (unique per tenant)
QDRANT_VOLUME_NAME=cw_rag_acme_corp_qdrant_storage
NETWORK_NAME=cw-rag-acme-corp-network

# Security Configuration
INGEST_TOKEN=acme-corp-secure-token-$(date +%Y)
CORS_ORIGIN=http://localhost:3101

# Tenant-Specific Features
VECTOR_DIM=384
PII_POLICY=STRICT          # OFF, BASIC, STRICT
EMBEDDINGS_PROVIDER=local
EMBEDDINGS_MODEL=bge-small-en-v1.5

# Rate Limiting (adjust per tenant SLA)
RATE_LIMIT_PER_IP=30
RATE_LIMIT_PER_USER=100
RATE_LIMIT_PER_TENANT=1000
RATE_LIMIT_WINDOW_MINUTES=1

# Timeout Configuration
VECTOR_SEARCH_TIMEOUT_MS=5000
KEYWORD_SEARCH_TIMEOUT_MS=3000
RERANKER_TIMEOUT_MS=10000
LLM_TIMEOUT_MS=25000
OVERALL_TIMEOUT_MS=45000
EMBEDDING_TIMEOUT_MS=5000
```

## Step 2: Create Tenant-Specific Docker Compose

### 2.1 Copy and Customize Docker Compose

```bash
# Copy the base docker-compose file
cp docker-compose.yml docker-compose.acme-corp.yml

# Update the compose file header
sed -i '1s/.*/# ACME Corp Tenant Configuration/' docker-compose.acme-corp.yml
```

### 2.2 Verify Tenant Isolation

Ensure the compose file uses environment variables for:
- Container names
- Port mappings
- Volume names
- Network names
- Environment variables

## Step 3: Deploy Tenant Stack

### 3.1 Start the Tenant Services

```bash
# Load tenant environment and start services
docker-compose --env-file .env.acme-corp -f docker-compose.acme-corp.yml up -d

# Verify all services are healthy
docker-compose --env-file .env.acme-corp -f docker-compose.acme-corp.yml ps
```

### 3.2 Verify Service Health

```bash
# Check API health
curl http://localhost:3100/healthz

# Check Qdrant
curl http://localhost:6433/healthz

# Check web interface
curl http://localhost:3101
```

## Step 4: Configure Tenant Data Access

### 4.1 Create Initial User Context

Create a test user context for the new tenant:

```json
{
  "id": "admin@acme-corp.com",
  "groupIds": ["acme-corp-admins", "acme-corp-users"],
  "tenantId": "acme-corp"
}
```

### 4.2 Test Document Ingestion

```bash
# Test document ingestion with tenant context
curl -X POST http://localhost:3100/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: acme-corp-secure-token-2024" \
  -H "x-tenant: acme-corp" \
  -d '{
    "content": "This is a test document for ACME Corp",
    "metadata": {
      "tenantId": "acme-corp",
      "docId": "test-doc-001",
      "acl": ["admin@acme-corp.com", "acme-corp-users"],
      "lang": "en"
    }
  }'
```

### 4.3 Test Document Retrieval

```bash
# Test retrieval with user context
curl -X POST http://localhost:3100/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test document",
    "userContext": {
      "id": "admin@acme-corp.com",
      "groupIds": ["acme-corp-admins", "acme-corp-users"],
      "tenantId": "acme-corp"
    }
  }'
```

## Step 5: Configure Tenant-Specific Features

### 5.1 Customize PII Detection (if needed)

```bash
# For STRICT PII policy
export PII_POLICY=STRICT

# For custom PII detection rules
# Create tenant-specific policy file
mkdir -p tenants/acme-corp/config
cat > tenants/acme-corp/config/pii-policy.json << EOF
{
  "enabled": true,
  "strictMode": true,
  "allowedPatterns": ["acme-corp.com"],
  "blockedPatterns": ["ssn", "credit-card"],
  "retentionDays": 365
}
EOF
```

### 5.2 Set Up Rate Limiting

```bash
# Adjust based on tenant SLA
export RATE_LIMIT_PER_TENANT=5000  # Premium tenant
export RATE_LIMIT_PER_USER=500     # Higher user limits
```

## Step 6: Set Up Tenant Monitoring

### 6.1 Configure Log Aggregation

```bash
# Create tenant-specific log directory
mkdir -p logs/acme-corp

# Configure log forwarding (example with fluentd)
cat > logs/acme-corp/fluentd.conf << EOF
<source>
  @type forward
  port 24224
  bind 0.0.0.0
</source>

<filter **>
  @type record_transformer
  <record>
    tenant acme-corp
    environment production
  </record>
</filter>

<match **>
  @type file
  path logs/acme-corp/app.log
  time_slice_format %Y%m%d%H
</match>
EOF
```

### 6.2 Set Up Health Monitoring

```bash
# Create monitoring script
cat > scripts/monitor-tenant.sh << EOF
#!/bin/bash

TENANT="acme-corp"
API_PORT=3100
WEB_PORT=3101
QDRANT_PORT=6433

echo "Monitoring tenant: $TENANT"
echo "API Health: $(curl -s http://localhost:$API_PORT/healthz)"
echo "Web Health: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$WEB_PORT)"
echo "Qdrant Health: $(curl -s http://localhost:$QDRANT_PORT/healthz)"

# Check container status
docker-compose --env-file .env.$TENANT -f docker-compose.$TENANT.yml ps
EOF

chmod +x scripts/monitor-tenant.sh
```

## Step 7: Configure Tenant Backup and Recovery

### 7.1 Set Up Data Backup

```bash
# Create backup script
cat > scripts/backup-tenant.sh << EOF
#!/bin/bash

TENANT="acme-corp"
BACKUP_DIR="backups/$TENANT/$(date +%Y%m%d)"
VOLUME_NAME="cw_rag_${TENANT}_qdrant_storage"

mkdir -p $BACKUP_DIR

# Backup Qdrant data
docker run --rm -v $VOLUME_NAME:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/qdrant-data.tar.gz -C /data .

# Backup configuration
cp .env.$TENANT $BACKUP_DIR/
cp docker-compose.$TENANT.yml $BACKUP_DIR/

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x scripts/backup-tenant.sh
```

### 7.2 Set Up Recovery Procedures

```bash
# Create recovery script
cat > scripts/restore-tenant.sh << EOF
#!/bin/bash

TENANT="$1"
BACKUP_DATE="$2"

if [ -z "$TENANT" ] || [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <tenant> <backup-date>"
  echo "Example: $0 acme-corp 20241224"
  exit 1
fi

BACKUP_DIR="backups/$TENANT/$BACKUP_DATE"
VOLUME_NAME="cw_rag_${TENANT}_qdrant_storage"

# Stop services
docker-compose --env-file .env.$TENANT -f docker-compose.$TENANT.yml down

# Restore Qdrant data
docker run --rm -v $VOLUME_NAME:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar xzf /backup/qdrant-data.tar.gz -C /data

# Restore configuration
cp $BACKUP_DIR/.env.$TENANT ./
cp $BACKUP_DIR/docker-compose.$TENANT.yml ./

# Restart services
docker-compose --env-file .env.$TENANT -f docker-compose.$TENANT.yml up -d

echo "Recovery completed for tenant: $TENANT"
EOF

chmod +x scripts/restore-tenant.sh
```

## Step 8: Document Tenant Configuration

### 8.1 Create Tenant Registry

```bash
# Create or update tenant registry
cat >> tenants/registry.json << EOF
{
  "tenants": [
    {
      "id": "acme-corp",
      "name": "ACME Corporation",
      "status": "active",
      "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "configuration": {
        "ports": {
          "api": 3100,
          "web": 3101,
          "qdrant": 6433,
          "qdrant_grpc": 6434
        },
        "limits": {
          "maxDocuments": 100000,
          "rateLimitPerTenant": 1000,
          "storageQuotaGB": 50
        },
        "features": {
          "piiDetection": "STRICT",
          "advancedSearch": true,
          "customBranding": false
        }
      }
    }
  ]
}
EOF
```

### 8.2 Update Documentation

Add the new tenant to your operational documentation:

```markdown
# Active Tenants

## ACME Corporation (acme-corp)
- **Status**: Active
- **API Port**: 3100
- **Web Port**: 3101
- **Contact**: admin@acme-corp.com
- **SLA**: Premium (99.9% uptime)
- **Features**: Strict PII detection, advanced search
- **Limits**: 100K documents, 1K requests/min
```

## Step 9: Validation and Testing

### 9.1 Run Integration Tests

```bash
# Test tenant isolation
./scripts/test-tenant-isolation.sh acme-corp

# Test performance under load
./scripts/load-test-tenant.sh acme-corp

# Test backup and recovery
./scripts/test-backup-recovery.sh acme-corp
```

### 9.2 Verify Security Boundaries

```bash
# Verify cross-tenant access is blocked
curl -X POST http://localhost:3100/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test",
    "userContext": {
      "id": "user@other-tenant.com",
      "groupIds": ["other-tenant-users"],
      "tenantId": "other-tenant"
    }
  }'
# Should return no results for acme-corp documents
```

## Step 10: Go-Live Checklist

- [ ] All services passing health checks
- [ ] Document ingestion working correctly
- [ ] Query retrieval respecting tenant boundaries
- [ ] Rate limiting configured appropriately
- [ ] PII detection (if enabled) working
- [ ] Backup procedures tested
- [ ] Monitoring and alerting configured
- [ ] Security validation completed
- [ ] Performance baselines established
- [ ] Documentation updated

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure each tenant uses unique ports
2. **Volume Conflicts**: Verify volume names include tenant identifier
3. **Network Isolation**: Check Docker network names are unique
4. **Token Authentication**: Verify INGEST_TOKEN is set correctly
5. **Cross-Tenant Access**: Review tenant filtering in queries

### Debugging Commands

```bash
# Check container logs
docker-compose --env-file .env.acme-corp logs api

# Verify Qdrant collection
curl http://localhost:6433/collections/docs_v1

# Test API connectivity
curl -v http://localhost:3100/healthz

# Check network connectivity
docker network ls | grep acme-corp
```

---

**Next Steps**: After successful tenant deployment, consider setting up automated monitoring, log aggregation, and performance optimization based on tenant usage patterns.