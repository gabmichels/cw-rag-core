# Multi-Tenant Docker Configuration

## Overview

This document describes the complete multi-tenant Docker setup for the CW-RAG system, including the fixes implemented to enable reliable multi-tenant isolation and automatic container startup.

## Key Fixes Implemented

### 1. Qdrant Health Check Issues
**Problem**: The original health check used `curl -f http://qdrant:6333/healthz` which failed because:
- `curl` was not available in the Qdrant container
- Incorrect hostname resolution

**Solution**: Replaced with TCP-based health check:
```yaml
healthcheck:
  test: ["CMD-SHELL", "timeout 2 bash -c 'cat < /dev/null > /dev/tcp/localhost/6333' || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 5
```

### 2. Container Stack Conflicts
**Problem**: Multiple tenants overwrote each other when using the same Docker Compose project name.

**Solution**: Added unique project names:
```yaml
name: ${PROJECT_PREFIX}-${TENANT}
```

### 3. Configuration Inconsistencies
**Problem**: Different configurations between tenant files caused startup failures.

**Solution**: Standardized all compose files with:
- Consistent environment variables
- Proper volume mappings (xenova-cache)
- Unified health check strategies
- Removed obsolete `version` attribute

### 4. Missing Dependencies
**Problem**: `gabmichels` tenant was missing `xenova-cache` volume and some environment variables.

**Solution**: Added missing configurations:
- xenova-cache volume mapping
- Missing environment variables (NODE_ENV, HOST, etc.)
- Consistent API health check endpoints

## Multi-Tenant Isolation Model

### Port Allocation

#### Zenithfall Tenant (Development Tier)
- **API**: `localhost:3000`
- **Web UI**: `localhost:3001`
- **Qdrant**: `localhost:6333-6334`
- **Embeddings**: `localhost:8080`
- **N8N**: `localhost:5678`

#### Gabmichels Tenant (Premium Tier)
- **API**: `localhost:3200`
- **Web UI**: `localhost:3201`
- **Qdrant**: `localhost:6533-6534`
- **Embeddings**: `localhost:8081`
- **N8N**: `localhost:5878`

### Container Naming Convention
- **Zenithfall**: `cw-rag-zenithfall-{service}`
- **Gabmichels**: `cw-rag-gabmichels-{service}`

### Network Isolation
- **Zenithfall**: `cw-rag-zenithfall-network`
- **Gabmichels**: `cw-rag-gabmichels-network`

### Volume Isolation
Each tenant has isolated volumes:
```yaml
volumes:
  qdrant_storage:
    name: ${QDRANT_VOLUME_NAME}  # e.g., cw-rag_gabmichels_qdrant_storage
  embeddings_cache:
    name: ${PROJECT_PREFIX}_${TENANT}_embeddings_cache
  xenova-cache:
    name: ${PROJECT_PREFIX}_${TENANT}_xenova_cache
```

## Starting Tenants

### Start Zenithfall Tenant
```bash
docker compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml up -d
```

### Start Gabmichels Tenant
```bash
docker compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml up -d
```

### Start Both Tenants Simultaneously
```bash
# Start zenithfall first
docker compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml up -d

# Then start gabmichels
docker compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml up -d
```

## Stopping Tenants

### Stop Zenithfall Tenant
```bash
docker compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml down
```

### Stop Gabmichels Tenant
```bash
docker compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml down
```

## Health Check Verification

### Check Container Status
```bash
docker ps
```

### Test API Health
```bash
# Zenithfall
curl http://localhost:3000/healthz

# Gabmichels
curl http://localhost:3200/healthz
```

### Test Qdrant Isolation
```bash
# Zenithfall collections
curl http://localhost:6333/collections

# Gabmichels collections
curl http://localhost:6533/collections
```

### Test Embedding Services
```bash
# Zenithfall embeddings
curl http://localhost:8080/health

# Gabmichels embeddings
curl http://localhost:8081/health
```

## Environment Configuration

### Tenant-Specific Variables
Each tenant has its own `.env.{tenant}` file with unique:
- Port assignments
- Container names
- Volume names
- Network names
- Security tokens
- Resource limits
- Rate limiting settings

### Critical Environment Variables
```bash
# Tenant identity
TENANT=zenithfall|gabmichels
PROJECT_PREFIX=cw-rag

# Unique port assignments
API_PORT=3000|3200
WEB_PORT=3001|3201
QDRANT_PORT=6333|6533
QDRANT_GRPC_PORT=6334|6534
EMBEDDINGS_PORT=8080|8081

# Unique naming
API_CONTAINER_NAME=cw-rag-{tenant}-api
WEB_CONTAINER_NAME=cw-rag-{tenant}-web
QDRANT_CONTAINER_NAME=cw-rag-{tenant}-qdrant
NETWORK_NAME=cw-rag-{tenant}-network
```

## Data Isolation Verification

### Qdrant Collection Isolation
- Each tenant maintains separate Qdrant instances
- Collections are completely isolated between tenants
- Data cannot cross tenant boundaries

### Volume Isolation
- Each service has tenant-specific volumes
- No shared data between tenant environments
- Independent scaling and resource allocation

### Network Isolation
- Each tenant operates on isolated Docker networks
- Inter-tenant communication is prevented at network level
- Each tenant can only access its own services

## Automatic Startup Configuration

All services are configured with `restart: unless-stopped` ensuring:
- Automatic startup after system reboots
- Recovery from container failures
- Consistent availability

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure no other services are using tenant ports
2. **Volume Permissions**: Check Docker volume permissions
3. **Health Check Failures**: Wait for initial startup period (30-60 seconds)
4. **Network Conflicts**: Ensure tenant networks don't overlap

### Recovery Procedures

1. **Restart Single Tenant**:
   ```bash
   docker compose --env-file .env.{tenant} -f docker-compose.{tenant}.yml restart
   ```

2. **Reset Tenant Data**:
   ```bash
   docker compose --env-file .env.{tenant} -f docker-compose.{tenant}.yml down -v
   docker compose --env-file .env.{tenant} -f docker-compose.{tenant}.yml up -d
   ```

3. **Check Logs**:
   ```bash
   docker compose --env-file .env.{tenant} -f docker-compose.{tenant}.yml logs
   ```

## Security Considerations

### Tenant Isolation
- Complete network isolation between tenants
- Separate authentication tokens per tenant
- Independent rate limiting configurations
- Isolated data storage and processing

### Access Control
- Each tenant has unique ingestion tokens
- CORS settings configured per tenant
- Rate limits enforced at tenant level

## Performance Monitoring

### Resource Usage
```bash
# Check resource usage per tenant
docker stats cw-rag-zenithfall-*
docker stats cw-rag-gabmichels-*
```

### Service Health
```bash
# Monitor all services
docker compose --env-file .env.zenithfall -f docker-compose.zenithfall.yml ps
docker compose --env-file .env.gabmichels -f docker-compose.gabmichels.yml ps
```

## Next Steps

1. **Load Testing**: Test concurrent access to both tenants
2. **Monitoring Setup**: Implement tenant-specific monitoring
3. **Backup Strategy**: Configure tenant-specific backup procedures
4. **Scaling**: Plan for horizontal scaling of tenant services
5. **Security Hardening**: Implement additional security measures

## Conclusion

The multi-tenant setup now provides:
- ✅ Reliable health checks and automatic startup
- ✅ Complete tenant isolation (network, data, resources)
- ✅ Conflict-free simultaneous operation
- ✅ Standardized configuration management
- ✅ Robust recovery and troubleshooting procedures

Both tenants can run simultaneously without conflicts, with full data isolation and independent scaling capabilities.