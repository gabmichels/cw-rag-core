# Docker Setup Strategy for Multi-Tenant RAG

## Overview

This document outlines the Docker deployment strategy for the cw-rag-core multi-tenant RAG system, ensuring complete tenant isolation while enabling efficient management and updates of the shared codebase.

## Docker Architecture Strategy

### Container Isolation Model

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               DOCKER HOST                                           │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                          TENANT A STACK                                     │   │
│  │  Network: cw-rag-acme-corp-network                                          │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ acme-api    │  │ acme-web    │  │ acme-qdrant │  │ acme-embeddings │   │   │
│  │  │ :3100       │  │ :3101       │  │ :6433       │  │ :8180           │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │         │                 │                 │                 │            │   │
│  │         └─────────────────┼─────────────────┼─────────────────┘            │   │
│  │                           │                 │                              │   │
│  │  ┌─────────────────────────┼─────────────────┼──────────────────────────┐   │   │
│  │  │ VOLUMES:                │                 │                          │   │   │
│  │  │ acme_corp_qdrant        │                 │                          │   │   │
│  │  │ acme_corp_embeddings    │                 │                          │   │   │
│  │  └─────────────────────────┼─────────────────┼──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                          TENANT B STACK                                     │   │
│  │  Network: cw-rag-client-xyz-network                                         │   │
│  │                                                                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │ xyz-api     │  │ xyz-web     │  │ xyz-qdrant  │  │ xyz-embeddings  │   │   │
│  │  │ :3200       │  │ :3201       │  │ :6533       │  │ :8280           │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘   │   │
│  │         │                 │                 │                 │            │   │
│  │         └─────────────────┼─────────────────┼─────────────────┘            │   │
│  │                           │                 │                              │   │
│  │  ┌─────────────────────────┼─────────────────┼──────────────────────────┐   │   │
│  │  │ VOLUMES:                │                 │                          │   │   │
│  │  │ client_xyz_qdrant       │                 │                          │   │   │
│  │  │ client_xyz_embeddings   │                 │                          │   │   │
│  │  └─────────────────────────┼─────────────────┼──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         SHARED REGISTRY                                     │   │
│  │                                                                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │   Base Images   │  │  Built Images   │  │      External Images       │   │   │
│  │  │                 │  │                 │  │                             │   │   │
│  │  │ • node:18-slim  │  │ • cw-rag-api    │  │ • qdrant/qdrant:latest      │   │   │
│  │  │ • alpine:latest │  │ • cw-rag-web    │  │ • huggingface/text-embed... │   │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Image Strategy

### 1. Shared Base Images

All tenants use the same Docker images built from the shared codebase:

```dockerfile
# apps/api/Dockerfile - Shared across all tenants
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 2. Image Versioning Strategy

```bash
# Image tagging convention
cw-rag-api:latest           # Latest development
cw-rag-api:v1.2.3          # Semantic versioning
cw-rag-api:sha-abc123      # Git commit hash
cw-rag-web:latest
cw-rag-web:v1.2.3
```

### 3. Registry Management

```yaml
# docker-compose.images.yml - Build and push images
version: '3.8'
services:
  api-build:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    image: ${REGISTRY}/cw-rag-api:${VERSION}

  web-build:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    image: ${REGISTRY}/cw-rag-web:${VERSION}
```

## Network Isolation

### Tenant-Specific Networks

Each tenant operates within its own Docker network, preventing cross-tenant communication:

```bash
# Automatic network creation per tenant
docker network create cw-rag-${TENANT}-network --driver bridge

# Network inspection
docker network inspect cw-rag-acme-corp-network
```

### Network Security Rules

```yaml
# docker-compose.tenant.yml
networks:
  app_network:
    name: ${NETWORK_NAME}  # cw-rag-${TENANT}-network
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"      # Inter-container communication within network
      com.docker.network.bridge.enable_ip_masquerade: "true"
      com.docker.network.driver.mtu: "1500"
    ipam:
      config:
        - subnet: 172.20.${TENANT_SUBNET}.0/24  # Unique subnet per tenant
```

## Volume Management

### Persistent Storage Strategy

```bash
# Volume naming convention
${PROJECT_PREFIX}_${TENANT}_${SERVICE}_${TYPE}

# Examples:
cw_rag_acme_corp_qdrant_storage
cw_rag_acme_corp_embeddings_cache
cw_rag_client_xyz_qdrant_storage
cw_rag_client_xyz_embeddings_cache
```

### Volume Lifecycle Management

```bash
#!/bin/bash
# scripts/volume-management.sh

# Create tenant volumes
create_tenant_volumes() {
    local tenant="$1"
    docker volume create "cw_rag_${tenant}_qdrant_storage"
    docker volume create "cw_rag_${tenant}_embeddings_cache"
    docker volume create "cw_rag_${tenant}_n8n_data"
}

# Backup tenant volumes
backup_tenant_volumes() {
    local tenant="$1"
    local backup_dir="backups/$tenant/$(date +%Y%m%d)"

    mkdir -p "$backup_dir"

    # Backup each volume
    for volume in qdrant_storage embeddings_cache n8n_data; do
        docker run --rm \
            -v "cw_rag_${tenant}_${volume}:/data" \
            -v "$(pwd)/$backup_dir:/backup" \
            alpine tar czf "/backup/${volume}.tar.gz" -C /data .
    done
}

# Restore tenant volumes
restore_tenant_volumes() {
    local tenant="$1"
    local backup_date="$2"
    local backup_dir="backups/$tenant/$backup_date"

    for volume in qdrant_storage embeddings_cache n8n_data; do
        if [[ -f "$backup_dir/${volume}.tar.gz" ]]; then
            docker run --rm \
                -v "cw_rag_${tenant}_${volume}:/data" \
                -v "$(pwd)/$backup_dir:/backup" \
                alpine sh -c "cd /data && tar xzf /backup/${volume}.tar.gz"
        fi
    done
}
```

## Port Management

### Dynamic Port Allocation

```bash
# scripts/port-allocation.sh

# Base ports for each service type
declare -A BASE_PORTS=(
    ["api"]=3000
    ["web"]=3001
    ["qdrant"]=6333
    ["qdrant_grpc"]=6334
    ["n8n"]=5678
    ["embeddings"]=8080
)

# Find next available port for a service
find_tenant_port() {
    local service="$1"
    local tenant_index="$2"  # 0-based tenant index

    local base_port=${BASE_PORTS[$service]}
    local assigned_port=$((base_port + (tenant_index * 100)))

    # Check if port is available
    while netstat -tuln 2>/dev/null | grep -q ":$assigned_port "; do
        assigned_port=$((assigned_port + 100))
    done

    echo "$assigned_port"
}

# Example usage:
# API_PORT=$(find_tenant_port "api" 0)      # 3000 for first tenant
# API_PORT=$(find_tenant_port "api" 1)      # 3100 for second tenant
```

### Port Registry

```json
{
  "port_registry": {
    "acme-corp": {
      "api": 3100,
      "web": 3101,
      "qdrant": 6433,
      "qdrant_grpc": 6434,
      "n8n": 5778,
      "embeddings": 8180
    },
    "client-xyz": {
      "api": 3200,
      "web": 3201,
      "qdrant": 6533,
      "qdrant_grpc": 6534,
      "n8n": 5878,
      "embeddings": 8280
    }
  }
}
```

## Deployment Orchestration

### Rolling Updates Strategy

```bash
#!/bin/bash
# scripts/rolling-update.sh

rolling_update_tenant() {
    local tenant="$1"
    local new_version="$2"

    log_info "Starting rolling update for tenant: $tenant"

    # Update environment with new version
    sed -i "s/IMAGE_VERSION=.*/IMAGE_VERSION=$new_version/" ".env.$tenant"

    # Pull new images
    docker-compose --env-file ".env.$tenant" -f "docker-compose.$tenant.yml" pull

    # Update API service first
    docker-compose --env-file ".env.$tenant" -f "docker-compose.$tenant.yml" up -d --no-deps api

    # Health check API
    local health_attempts=0
    while [[ $health_attempts -lt 30 ]]; do
        local api_port=$(grep API_PORT ".env.$tenant" | cut -d= -f2)
        if curl -f "http://localhost:$api_port/healthz" &>/dev/null; then
            log_info "✅ API health check passed"
            break
        fi
        sleep 2
        health_attempts=$((health_attempts + 1))
    done

    if [[ $health_attempts -eq 30 ]]; then
        log_error "❌ API health check failed - rolling back"
        # Rollback logic here
        return 1
    fi

    # Update Web service
    docker-compose --env-file ".env.$tenant" -f "docker-compose.$tenant.yml" up -d --no-deps web

    log_info "✅ Rolling update completed for tenant: $tenant"
}

# Update all tenants with zero downtime
update_all_tenants() {
    local new_version="$1"
    local tenants=$(find . -name ".env.*" -type f | sed 's/\.env\.//' | sed 's/\.\///')

    for tenant in $tenants; do
        log_info "Updating tenant: $tenant"
        if rolling_update_tenant "$tenant" "$new_version"; then
            log_info "✅ Successfully updated $tenant"
        else
            log_error "❌ Failed to update $tenant"
            # Continue with other tenants or abort based on policy
        fi

        # Optional: Add delay between tenant updates
        sleep 30
    done
}
```

### Blue-Green Deployment (Advanced)

```bash
#!/bin/bash
# scripts/blue-green-deploy.sh

blue_green_deployment() {
    local tenant="$1"
    local new_version="$2"

    # Create green environment
    local green_api_port=$(($(grep API_PORT ".env.$tenant" | cut -d= -f2) + 10000))
    local green_web_port=$(($(grep WEB_PORT ".env.$tenant" | cut -d= -f2) + 10000))

    # Create green environment file
    sed "s/API_PORT=.*/API_PORT=$green_api_port/" ".env.$tenant" > ".env.$tenant.green"
    sed -i "s/WEB_PORT=.*/WEB_PORT=$green_web_port/" ".env.$tenant.green"
    sed -i "s/IMAGE_VERSION=.*/IMAGE_VERSION=$new_version/" ".env.$tenant.green"

    # Deploy green environment
    docker-compose --env-file ".env.$tenant.green" -f "docker-compose.$tenant.yml" up -d

    # Health check green environment
    if curl -f "http://localhost:$green_api_port/healthz" &>/dev/null; then
        # Switch traffic (update load balancer or proxy)
        switch_traffic_to_green "$tenant" "$green_api_port" "$green_web_port"

        # Shutdown blue environment
        docker-compose --env-file ".env.$tenant" -f "docker-compose.$tenant.yml" down

        # Promote green to blue
        mv ".env.$tenant.green" ".env.$tenant"

        log_info "✅ Blue-green deployment completed for $tenant"
    else
        # Rollback - shutdown green environment
        docker-compose --env-file ".env.$tenant.green" -f "docker-compose.$tenant.yml" down
        rm ".env.$tenant.green"

        log_error "❌ Green environment health check failed - keeping blue"
        return 1
    fi
}
```

## Resource Management

### Container Resource Limits

```yaml
# docker-compose.tenant.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '${API_CPU_LIMIT:-1.0}'
          memory: '${API_MEMORY_LIMIT:-1G}'
        reservations:
          cpus: '${API_CPU_RESERVATION:-0.25}'
          memory: '${API_MEMORY_RESERVATION:-256M}'

  web:
    deploy:
      resources:
        limits:
          cpus: '${WEB_CPU_LIMIT:-0.5}'
          memory: '${WEB_MEMORY_LIMIT:-512M}'
        reservations:
          cpus: '${WEB_CPU_RESERVATION:-0.1}'
          memory: '${WEB_MEMORY_RESERVATION:-128M}'

  qdrant:
    deploy:
      resources:
        limits:
          cpus: '${QDRANT_CPU_LIMIT:-2.0}'
          memory: '${QDRANT_MEMORY_LIMIT:-4G}'
        reservations:
          cpus: '${QDRANT_CPU_RESERVATION:-0.5}'
          memory: '${QDRANT_MEMORY_RESERVATION:-1G}'
```

### Tenant Resource Tiers

```bash
# Resource configuration by tier
set_resource_limits() {
    local tenant="$1"
    local tier="$2"

    case "$tier" in
        "basic")
            echo "API_CPU_LIMIT=0.5" >> ".env.$tenant"
            echo "API_MEMORY_LIMIT=512M" >> ".env.$tenant"
            echo "QDRANT_CPU_LIMIT=1.0" >> ".env.$tenant"
            echo "QDRANT_MEMORY_LIMIT=2G" >> ".env.$tenant"
            ;;
        "premium")
            echo "API_CPU_LIMIT=1.0" >> ".env.$tenant"
            echo "API_MEMORY_LIMIT=1G" >> ".env.$tenant"
            echo "QDRANT_CPU_LIMIT=2.0" >> ".env.$tenant"
            echo "QDRANT_MEMORY_LIMIT=4G" >> ".env.$tenant"
            ;;
        "enterprise")
            echo "API_CPU_LIMIT=2.0" >> ".env.$tenant"
            echo "API_MEMORY_LIMIT=2G" >> ".env.$tenant"
            echo "QDRANT_CPU_LIMIT=4.0" >> ".env.$tenant"
            echo "QDRANT_MEMORY_LIMIT=8G" >> ".env.$tenant"
            ;;
    esac
}
```

## Monitoring and Logging

### Container Health Monitoring

```yaml
# Health check configuration
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:3000/healthz || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 3
  start_period: 30s
```

### Centralized Logging

```yaml
# docker-compose.logging.yml
services:
  fluentd:
    image: fluentd:v1.16-1
    ports:
      - "24224:24224"
    volumes:
      - ./logging/fluentd.conf:/fluentd/etc/fluent.conf
      - logs:/var/log/fluentd
    networks:
      - monitoring

# Add to each tenant service
logging:
  driver: fluentd
  options:
    fluentd-address: localhost:24224
    tag: "tenant.${TENANT}.{{.Name}}"
```

## Security Considerations

### Container Security

```dockerfile
# Security-hardened Dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
WORKDIR /app
COPY --chown=nodejs:nodejs . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Network Security

```yaml
# Restrict network access
networks:
  app_network:
    internal: true  # No external internet access
  external_network:
    # Only specific services can access external network
```

## Best Practices Summary

### ✅ DO
- Use consistent naming conventions for all Docker resources
- Implement health checks for all services
- Use resource limits to prevent resource starvation
- Implement proper logging and monitoring
- Use secrets management for sensitive data
- Regularly update base images for security patches
- Implement automated backup strategies
- Use proper image versioning and registry management

### ❌ DON'T
- Share containers between tenants
- Use default networks for tenant services
- Hardcode ports in Docker Compose files
- Run containers as root user
- Store secrets in environment files
- Use latest tags in production
- Mix tenant data in shared volumes
- Skip health checks or monitoring

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   netstat -tuln | grep :3000

   # Find process using port
   lsof -i :3000
   ```

2. **Volume Permission Issues**
   ```bash
   # Fix volume permissions
   docker run --rm -v volume_name:/data alpine chown -R 1001:1001 /data
   ```

3. **Network Connectivity**
   ```bash
   # Test network connectivity between containers
   docker exec container1 ping container2
   ```

4. **Resource Exhaustion**
   ```bash
   # Monitor resource usage
   docker stats

   # Check system resources
   docker system df
   ```

---

This Docker strategy ensures complete tenant isolation while maintaining operational efficiency and enabling seamless updates across all tenants.