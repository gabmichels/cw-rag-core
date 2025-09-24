# Multi-Tenant Architecture: Core vs Tenant Separation

## Architecture Overview

This document explains how cw-rag-core achieves clean separation between shared core components and tenant-specific configurations, ensuring complete tenant isolation while enabling efficient codebase updates.

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 TENANT BOUNDARY                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                            TENANT A (acme-corp)                             │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │   Web UI    │  │  API Server │  │   Qdrant    │  │   Embeddings    │   │   │
│  │  │  :3101      │  │   :3100     │  │   :6433     │  │     :8180       │   │   │
│  │  │             │  │             │  │             │  │                 │   │   │
│  │  │ TENANT A    │  │ TENANT A    │  │ TENANT A    │  │   TENANT A      │   │   │
│  │  │ CONFIG      │  │ CONFIG      │  │ DATA        │  │   CACHE         │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │                                                                             │   │
│  │  Network: cw-rag-acme-corp-network                                         │   │
│  │  Volumes: cw_rag_acme_corp_*                                               │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 TENANT BOUNDARY                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                            TENANT B (client-xyz)                            │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │   Web UI    │  │  API Server │  │   Qdrant    │  │   Embeddings    │   │   │
│  │  │  :3201      │  │   :3200     │  │   :6533     │  │     :8280       │   │   │
│  │  │             │  │             │  │             │  │                 │   │   │
│  │  │ TENANT B    │  │ TENANT B    │  │ TENANT B    │  │   TENANT B      │   │   │
│  │  │ CONFIG      │  │ CONFIG      │  │ DATA        │  │   CACHE         │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │                                                                             │   │
│  │  Network: cw-rag-client-xyz-network                                        │   │
│  │  Volumes: cw_rag_client_xyz_*                                              │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                SHARED CORE LAYER                                    │
│                                                                                     │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │    Source   │  │    Packages     │  │     Docker      │  │   Development   │   │
│  │    Code     │  │                 │  │     Images      │  │     Tools       │   │
│  │             │  │  @cw-rag-core/  │  │                 │  │                 │   │
│  │ apps/api/   │  │  - shared       │  │  • Fastify API  │  │  • TypeScript   │   │
│  │ apps/web/   │  │  - retrieval    │  │  • Next.js Web  │  │  • ESLint       │   │
│  │ packages/   │  │  - ingestion    │  │  • Qdrant       │  │  • Prettier     │   │
│  │             │  │  - evals        │  │  • BGE Model    │  │  • Jest         │   │
│  └─────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                                     │
│  All tenants share the same codebase but run isolated instances                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Core vs Tenant Separation Matrix

| Component | CORE (Shared) | TENANT (Isolated) |
|-----------|---------------|-------------------|
| **Source Code** | ✅ Same codebase for all tenants | ❌ No tenant-specific code |
| **Docker Images** | ✅ Built once, used by all tenants | ❌ No custom images per tenant |
| **TypeScript Packages** | ✅ Shared across all tenants | ❌ No tenant-specific packages |
| **Configuration** | ❌ No shared config | ✅ Tenant-specific env vars |
| **Data Storage** | ❌ No shared data | ✅ Tenant-isolated Qdrant volumes |
| **Network Layer** | ❌ No shared networks | ✅ Tenant-specific Docker networks |
| **Container Instances** | ❌ No shared containers | ✅ Separate containers per tenant |
| **Port Mappings** | ❌ No shared ports | ✅ Unique ports per tenant |
| **Security Tokens** | ❌ No shared tokens | ✅ Tenant-specific auth tokens |
| **Rate Limits** | ❌ No shared limits | ✅ Tenant-specific quotas |
| **Backup Storage** | ❌ No shared backups | ✅ Tenant-isolated backup volumes |

## Data Flow with Tenant Isolation

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              REQUEST LIFECYCLE                                      │
│                                                                                     │
│  User Request (Tenant A)                                                           │
│         │                                                                          │
│         ▼                                                                          │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                       │
│  │ Load       │      │ Container   │      │ Tenant      │                        │
│  │ Balancer   │ ──►  │ Router      │ ──► │ Context     │                        │
│  │ (Port)     │      │ (Network)   │      │ Validation  │                        │
│  └─────────────┘      └─────────────┘      └─────────────┘                       │
│         │                     │                     │                            │
│         │                     ▼                     ▼                            │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                       │
│  │ Tenant A    │      │ Tenant A    │      │ Tenant A    │                       │
│  │ Web UI      │      │ API Server  │      │ Qdrant DB   │                       │
│  │ :3101       │ ◄──► │ :3100       │ ◄──► │ :6433       │                       │
│  └─────────────┘      └─────────────┘      └─────────────┘                       │
│         │                     │                     │                            │
│         │                     ▼                     ▼                            │
│         │              ┌─────────────┐      ┌─────────────┐                       │
│         │              │ Tenant      │      │ Tenant A    │                       │
│         │              │ Filtering   │      │ Data Only   │                       │
│         │              │ (WHERE      │      │ (payload.   │                       │
│         │              │ tenant='A') │      │ tenant='A') │                       │
│         │              └─────────────┘      └─────────────┘                       │
│         │                                                                         │
│         ▼                                                                         │
│  Response filtered to Tenant A data only                                          │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Security Boundaries

### Layer 1: Infrastructure Isolation
```
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE ISOLATION                     │
│                                                                 │
│  Tenant A                           Tenant B                   │
│  ┌─────────────────┐                ┌─────────────────┐        │
│  │ Docker Network  │                │ Docker Network  │        │
│  │ acme-corp-net   │     ❌ NO      │ client-xyz-net  │        │
│  │                 │  CROSS-NETWORK │                 │        │
│  │ Port Range:     │  COMMUNICATION │ Port Range:     │        │
│  │ 3100-3199       │                │ 3200-3299       │        │
│  │                 │                │                 │        │
│  │ Volumes:        │                │ Volumes:        │        │
│  │ acme_corp_*     │                │ client_xyz_*    │        │
│  └─────────────────┘                └─────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 2: Application-Level Filtering
```typescript
// Every query includes mandatory tenant filtering
const searchFilter = {
  must: [
    {
      key: 'tenant',
      match: { any: [userContext.tenantId] }  // HARD BOUNDARY
    },
    {
      key: 'acl',
      match: { any: userContext.groupIds }    // RBAC within tenant
    }
  ]
};
```

### Layer 3: Data-Level Isolation
```typescript
// Every document stored with tenant context
interface DocumentPayload {
  tenant: string;        // MANDATORY - no document without tenant
  docId: string;         // Unique within tenant
  acl: string[];         // Access control within tenant
  content: string;       // Actual document content
  // ... other metadata
}
```

## Clean Separation of Concerns

### 1. Configuration Separation

**GOOD**: Tenant-specific environment variables
```bash
# .env.acme-corp
TENANT=acme-corp
API_PORT=3100
INGEST_TOKEN=acme-corp-token

# .env.client-xyz
TENANT=client-xyz
API_PORT=3200
INGEST_TOKEN=client-xyz-token
```

**BAD**: Hardcoded tenant logic in code
```typescript
// ❌ DON'T DO THIS
if (tenant === 'acme-corp') {
  rateLimitPerMinute = 1000;
} else if (tenant === 'client-xyz') {
  rateLimitPerMinute = 500;
}
```

### 2. Data Separation

**GOOD**: Tenant filtering at database level
```typescript
// ✅ Tenant context automatically enforced
const searchResults = await qdrantClient.search(collection, {
  vector: queryVector,
  filter: {
    must: [{ key: 'tenant', match: { any: [userContext.tenantId] } }]
  }
});
```

**BAD**: Mixing tenant data in application logic
```typescript
// ❌ DON'T DO THIS - manual filtering prone to errors
const allResults = await qdrantClient.search(collection, { vector: queryVector });
const tenantResults = allResults.filter(r => r.payload.tenant === currentTenant);
```

### 3. Container Separation

**GOOD**: Isolated container stacks
```yaml
# docker-compose.acme-corp.yml
services:
  api:
    container_name: cw-rag-acme-corp-api
    ports:
      - "3100:3000"
    networks:
      - acme-corp-network
```

**BAD**: Shared containers with conditional logic
```yaml
# ❌ DON'T DO THIS
services:
  api:
    container_name: shared-api
    environment:
      - SUPPORTED_TENANTS=acme-corp,client-xyz
```

### 4. Update Strategy for Shared Codebase

**Deployment Flow**:
```
┌─────────────────────────────────────────────────────────────────┐
│                     CODEBASE UPDATE FLOW                        │
│                                                                 │
│  1. Code Update                                                 │
│     ┌─────────────┐                                            │
│     │ git push    │ ──► CI/CD builds new Docker images          │
│     │ main        │                                             │
│     └─────────────┘                                            │
│                                                                 │
│  2. Image Distribution                                          │
│     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│     │ Registry    │ ──► │ Tenant A    │     │ Tenant B    │   │
│     │ (new image) │     │ Update      │     │ Update      │   │
│     └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                                 │
│  3. Rolling Update (per tenant)                                │
│     ┌─────────────────────────────────────────────────────┐   │
│     │ docker-compose --env-file .env.acme-corp \         │   │
│     │   -f docker-compose.acme-corp.yml \                │   │
│     │   up -d --no-deps api web                          │   │
│     └─────────────────────────────────────────────────────┘   │
│                                                                 │
│  4. Validation                                                  │
│     ┌─────────────┐                                            │
│     │ Health      │ ──► If healthy, continue to next tenant    │
│     │ Check       │     If failed, rollback this tenant       │
│     └─────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Tenant Management Scripts

### Update All Tenants Script
```bash
#!/bin/bash
# scripts/update-all-tenants.sh

TENANTS=("acme-corp" "client-xyz" "healthcare-inc")
NEW_IMAGE_TAG="$1"

if [ -z "$NEW_IMAGE_TAG" ]; then
  echo "Usage: $0 <image-tag>"
  exit 1
fi

for tenant in "${TENANTS[@]}"; do
  echo "Updating tenant: $tenant"

  # Update image tag in environment
  sed -i "s/IMAGE_TAG=.*/IMAGE_TAG=$NEW_IMAGE_TAG/" .env.$tenant

  # Rolling update
  docker-compose --env-file .env.$tenant \
    -f docker-compose.$tenant.yml \
    up -d --no-deps api web

  # Health check
  sleep 30
  if curl -f http://localhost:$(grep API_PORT .env.$tenant | cut -d= -f2)/healthz; then
    echo "✅ Tenant $tenant updated successfully"
  else
    echo "❌ Tenant $tenant update failed - rolling back"
    # Rollback logic here
    git checkout HEAD~1 -- .env.$tenant
    docker-compose --env-file .env.$tenant \
      -f docker-compose.$tenant.yml \
      up -d --no-deps api web
  fi
done
```

## Monitoring and Observability

### Tenant-Aware Metrics
```typescript
// Each metric tagged with tenant context
interface TenantMetrics {
  // Request metrics
  'requests.total': { tenant: string, endpoint: string, status: number };
  'requests.duration': { tenant: string, endpoint: string };

  // Resource metrics
  'documents.count': { tenant: string };
  'storage.bytes': { tenant: string };
  'queries.rate': { tenant: string };

  // Error metrics
  'errors.total': { tenant: string, type: string };
  'security.violations': { tenant: string, type: string };
}
```

### Log Aggregation Pattern
```yaml
# logs/fluentd.conf
<source>
  @type forward
  port 24224
</source>

<filter **>
  @type record_transformer
  <record>
    tenant ${record['container_name'].split('-')[2]} # Extract from container name
    environment production
  </record>
</filter>

<match **>
  @type elasticsearch
  index_name logs-${tenant}-%Y%m%d
</match>
```

## Best Practices Summary

### ✅ DO
- Use environment variables for all tenant-specific configuration
- Enforce tenant filtering at the database level
- Run separate container stacks per tenant
- Use unique ports, networks, and volumes per tenant
- Implement health checks for each tenant service
- Tag all logs and metrics with tenant context
- Test tenant isolation regularly
- Use consistent naming conventions: `{project}-{tenant}-{service}`

### ❌ DON'T
- Hardcode tenant-specific logic in application code
- Share containers between tenants
- Use shared databases without proper filtering
- Expose internal errors to unauthorized tenants
- Mix tenant data in logs or metrics
- Skip tenant boundary validation tests
- Use shared authentication tokens
- Allow cross-tenant network communication

---

This architecture ensures complete tenant isolation while maintaining operational efficiency through shared codebase updates and standardized deployment patterns.