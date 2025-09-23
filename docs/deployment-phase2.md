# Phase 2 Deployment & Operations Guide

This guide provides comprehensive deployment and operational procedures for CW RAG Core Phase 2, covering the complete production-grade RAG pipeline with hybrid search, reranking, guardrails, and answer synthesis.

## 🎯 Deployment Overview

Phase 2 introduces several new services and configurations that must be properly deployed and configured for optimal performance:

- **Hybrid Search Engine** with vector + keyword fusion
- **Cross-Encoder Reranker Service** for relevance optimization
- **LLM Integration** for answer synthesis
- **Enhanced RBAC** with language filtering
- **Evaluation Framework** with automated testing
- **Monitoring & Alerting** for production operations

---

## 🐳 Docker Deployment

### Complete Docker Compose Configuration

Create or update your `docker-compose.yml` with the complete Phase 2 stack:

```yaml
version: '3.8'

services:
  # API Service with Phase 2 Features
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: cw-rag-api
    ports:
      - "3000:3000"
    environment:
      # Database Configuration
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333

      # Phase 2: Hybrid Search Configuration
      - HYBRID_SEARCH_ENABLED=true
      - HYBRID_SEARCH_VECTOR_WEIGHT=0.7
      - HYBRID_SEARCH_KEYWORD_WEIGHT=0.3
      - HYBRID_SEARCH_RRF_K=60
      - HYBRID_SEARCH_VECTOR_TOP_K=20
      - HYBRID_SEARCH_KEYWORD_TOP_K=20

      # Phase 2: Reranker Configuration
      - RERANKER_ENABLED=true
      - RERANKER_MODEL=ms-marco-MiniLM-L-6-v2
      - RERANKER_API_URL=http://reranker:8081
      - RERANKER_TIMEOUT=5000
      - RERANKER_FALLBACK_ENABLED=true

      # Phase 2: Guardrails Configuration
      - GUARDRAILS_ENABLED=true
      - GUARDRAILS_DEFAULT_THRESHOLD=0.3
      - GUARDRAILS_AUDIT_ENABLED=true
      - GUARDRAILS_IDK_TEMPLATES_ENABLED=true

      # Phase 2: LLM Integration
      - LLM_PROVIDER=openai
      - LLM_MODEL=gpt-4.1-2025-04-14-turbo
      - LLM_MAX_TOKENS=500
      - LLM_TEMPERATURE=0.1
      - LLM_TIMEOUT=10000
      - OPENAI_API_KEY=${OPENAI_API_KEY}

      # Phase 2: Answer Synthesis
      - SYNTHESIS_ENABLED=true
      - SYNTHESIS_MAX_CONTEXT_LENGTH=8000
      - SYNTHESIS_INCLUDE_CITATIONS=true
      - SYNTHESIS_ANSWER_FORMAT=markdown

      # Phase 2: Citation Configuration
      - CITATIONS_ENABLED=true
      - CITATIONS_FRESHNESS_ENABLED=true
      - CITATIONS_MAX_PER_ANSWER=10

      # Phase 2: Performance Configuration
      - NODE_OPTIONS=--max-old-space-size=2048
      - MAX_CONCURRENT_REQUESTS=100
      - REQUEST_TIMEOUT=30000

    depends_on:
      - qdrant
      - reranker
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Web UI with Phase 2 Features
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: cw-rag-web
    ports:
      - "3001:3001"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3000
      - NEXT_PUBLIC_CITATIONS_ENABLED=true
      - NEXT_PUBLIC_FRESHNESS_ENABLED=true
      - NEXT_PUBLIC_CONFIDENCE_DISPLAY=true
    depends_on:
      - api
    networks:
      - app_network
    restart: unless-stopped

  # Qdrant Vector Database
  qdrant:
    image: qdrant/qdrant:v1.7.4
    container_name: cw-rag-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    environment:
      # Phase 2: Optimized Qdrant Configuration
      - QDRANT__STORAGE__OPTIMIZERS__DEFAULT_SEGMENT_NUMBER=4
      - QDRANT__STORAGE__OPTIMIZERS__MAX_SEGMENT_SIZE=20000000
      - QDRANT__STORAGE__OPTIMIZERS__INDEXING_THRESHOLD=10000
      - QDRANT__STORAGE__QUANTIZATION__SCALAR__TYPE=int8
      - QDRANT__STORAGE__QUANTIZATION__SCALAR__QUANTILE=0.99
      - QDRANT__SERVICE__HTTP_PORT=6334
      - QDRANT__SERVICE__GRPC_PORT=6333
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - app_network
    restart: unless-stopped

  # Phase 2: Cross-Encoder Reranker Service
  reranker:
    image: sentence-transformers/cross-encoder:ms-marco-MiniLM-L-6-v2
    container_name: cw-rag-reranker
    ports:
      - "8081:8080"
    environment:
      - MODEL_NAME=ms-marco-MiniLM-L-6-v2
      - MAX_LENGTH=512
      - BATCH_SIZE=32
      - MAX_BATCH_SIZE=64
      - MODEL_CACHE_SIZE=1024
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    networks:
      - app_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # BGE Embedding Service (Enhanced)
  embeddings:
    image: huggingface/text-embeddings-inference:1.2
    container_name: cw-rag-embeddings
    ports:
      - "8080:8080"
    environment:
      - MODEL_ID=BAAI/bge-small-en-v1.5
      - REVISION=main
      - MAX_BATCH_SIZE=32
      - MAX_CONCURRENT_REQUESTS=128
      - PORT=8080
      - TRUST_REMOTE_CODE=true
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    networks:
      - app_network
    restart: unless-stopped

  # Phase 2: Evaluation Service
  evaluation:
    build:
      context: ./packages/evals
      dockerfile: Dockerfile
    container_name: cw-rag-evaluation
    environment:
      - API_URL=http://api:3000
      - EVALUATION_DATASETS=gold,ood,inject,rbac
      - EVALUATION_OUTPUT_DIR=/app/results
      - EVALUATION_PARALLEL=true
      - EVALUATION_MAX_CONCURRENCY=5
    volumes:
      - ./eval-results:/app/results
    depends_on:
      - api
    networks:
      - app_network
    profiles:
      - evaluation
    restart: "no"

  # n8n Workflow Automation
  n8n:
    image: n8nio/n8n:1.12.0
    container_name: cw-rag-n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER:-admin}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:-changeme}
      - WEBHOOK_URL=http://n8n:5678/
      - GENERIC_TIMEZONE=UTC
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n/workflows:/opt/custom-workflows:ro
    networks:
      - app_network
    restart: unless-stopped

  # Phase 2: Redis Cache (Optional Performance Enhancement)
  redis:
    image: redis:7.2-alpine
    container_name: cw-rag-redis
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - app_network
    restart: unless-stopped
    profiles:
      - cache

volumes:
  qdrant_data:
    driver: local
  n8n_data:
    driver: local
  redis_data:
    driver: local

networks:
  app_network:
    driver: bridge
```

### Environment Configuration

Create a comprehensive `.env` file:

```bash
# Phase 2 Environment Configuration

# Basic Configuration
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3000
WEB_PORT=3001

# Database Configuration
QDRANT_HOST=qdrant
QDRANT_PORT=6333
QDRANT_GRPC_PORT=6334

# Phase 2: Hybrid Search Configuration
HYBRID_SEARCH_ENABLED=true
HYBRID_SEARCH_VECTOR_WEIGHT=0.7
HYBRID_SEARCH_KEYWORD_WEIGHT=0.3
HYBRID_SEARCH_RRF_K=60
HYBRID_SEARCH_VECTOR_TOP_K=20
HYBRID_SEARCH_KEYWORD_TOP_K=20
HYBRID_SEARCH_CACHE_TTL=300

# Phase 2: Reranker Configuration
RERANKER_ENABLED=true
RERANKER_MODEL=ms-marco-MiniLM-L-6-v2
RERANKER_API_URL=http://reranker:8081
RERANKER_TIMEOUT=5000
RERANKER_MAX_DOCUMENTS=20
RERANKER_FALLBACK_ENABLED=true
RERANKER_CACHE_ENABLED=true

# Phase 2: Answerability Guardrails
GUARDRAILS_ENABLED=true
GUARDRAILS_DEFAULT_THRESHOLD=0.3
GUARDRAILS_PERMISSIVE_THRESHOLD=0.2
GUARDRAILS_STRICT_THRESHOLD=0.5
GUARDRAILS_PARANOID_THRESHOLD=0.7
GUARDRAILS_AUDIT_ENABLED=true
GUARDRAILS_IDK_TEMPLATES_ENABLED=true
GUARDRAILS_BYPASS_ADMIN=false

# Phase 2: LLM Integration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-2025-04-14-turbo
LLM_MAX_TOKENS=500
LLM_TEMPERATURE=0.1
LLM_TIMEOUT=10000
LLM_FALLBACK_ENABLED=true
OPENAI_API_KEY=your-openai-api-key-here

# Alternative LLM Providers (Optional)
ANTHROPIC_API_KEY=your-anthropic-key-here
CLAUDE_MODEL=claude-3-sonnet-20240229

# Local LLM Configuration (Optional)
LOCAL_LLM_ENABLED=false
LOCAL_LLM_URL=http://localhost:8082
LOCAL_LLM_MODEL=llama-2-7b-chat

# Phase 2: Answer Synthesis
SYNTHESIS_ENABLED=true
SYNTHESIS_MAX_CONTEXT_LENGTH=8000
SYNTHESIS_INCLUDE_CITATIONS=true
SYNTHESIS_ANSWER_FORMAT=markdown
SYNTHESIS_QUALITY_VALIDATION=true
SYNTHESIS_FALLBACK_TEMPLATE=true

# Phase 2: Citation Configuration
CITATIONS_ENABLED=true
CITATIONS_FRESHNESS_ENABLED=true
CITATIONS_MAX_PER_ANSWER=10
CITATIONS_MIN_CONTENT_LENGTH=50
CITATIONS_DEDUPLICATION=true

# Phase 2: Enhanced RBAC
RBAC_ENHANCED_ENABLED=true
RBAC_LANGUAGE_FILTERING=true
RBAC_GROUP_HIERARCHY=true
RBAC_AUDIT_LOGGING=true

# Phase 2: Performance Configuration
MAX_CONCURRENT_REQUESTS=100
REQUEST_TIMEOUT=30000
CACHE_ENABLED=true
CACHE_TTL=300
REDIS_URL=redis://redis:6379

# Phase 2: Evaluation Configuration
EVALUATION_ENABLED=true
EVALUATION_DATASETS=gold,ood,inject,rbac
EVALUATION_PARALLEL=true
EVALUATION_MAX_CONCURRENCY=5
EVALUATION_OUTPUT_DIR=./eval-results

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30
ALERT_WEBHOOK_URL=your-webhook-url-here

# Security Configuration
CORS_ORIGINS=http://localhost:3001
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=your-secure-password-here
N8N_WEBHOOK_URL=http://n8n:5678/webhook/
```

---

## 🚀 Deployment Steps

### 1. Pre-Deployment Checklist

```bash
# Verify system requirements
docker --version          # >= 24.0.0
docker-compose --version  # >= 2.0.0
node --version            # >= 18.0.0 (for development)

# Check available resources
df -h                     # Ensure >10GB free space
free -h                   # Ensure >8GB RAM available
```

### 2. Environment Setup

```bash
# Clone repository
git clone https://github.com/your-org/cw-rag-core.git
cd cw-rag-core

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Create required directories
mkdir -p eval-results
mkdir -p logs
mkdir -p data/qdrant
```

### 3. Build and Deploy

```bash
# Build all services
docker-compose build

# Start core services
docker-compose up -d qdrant embeddings

# Wait for core services to be ready
sleep 30

# Start Phase 2 services
docker-compose up -d reranker api web

# Optional: Start cache and n8n
docker-compose --profile cache up -d redis
docker-compose up -d n8n
```

### 4. Verification

```bash
# Health check all services
curl http://localhost:3000/healthz    # API health
curl http://localhost:6334/           # Qdrant web UI
curl http://localhost:8081/health     # Reranker health
curl http://localhost:8080/health     # Embeddings health

# Test Phase 2 features
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is hybrid search?",
    "userContext": {
      "id": "test-user",
      "tenantId": "test-tenant",
      "groupIds": ["public"]
    },
    "k": 8
  }'
```

### 5. Data Loading

```bash
# Load initial data via n8n (if configured)
curl -X POST http://localhost:5678/webhook/ingest

# Or load via API
curl -X POST http://localhost:3000/ingest/normalize \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: your-token-here" \
  -d @sample-documents.json
```

---

## 🔧 Configuration Management

### Service Configuration

#### API Service Configuration
```typescript
// apps/api/config/production.ts
export const productionConfig = {
  hybridSearch: {
    enabled: true,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    rrfK: 60,
    cacheEnabled: true,
    cacheTTL: 300
  },
  reranker: {
    enabled: true,
    model: 'ms-marco-MiniLM-L-6-v2',
    apiUrl: 'http://reranker:8081',
    timeout: 5000,
    fallbackEnabled: true
  },
  guardrails: {
    enabled: true,
    defaultThreshold: 0.3,
    auditEnabled: true,
    idkTemplatesEnabled: true
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4.1-2025-04-14-turbo',
    maxTokens: 500,
    temperature: 0.1,
    timeout: 10000
  },
  synthesis: {
    enabled: true,
    maxContextLength: 8000,
    includeCitations: true,
    answerFormat: 'markdown'
  }
};
```

#### Qdrant Optimization
```yaml
# qdrant-config.yaml
storage:
  optimizers:
    default_segment_number: 4
    max_segment_size: 20000000
    indexing_threshold: 10000

  quantization:
    scalar:
      type: int8
      quantile: 0.99

  performance:
    max_search_threads: 4
    search_hnsw_ef: 128
```

### Tenant Configuration

#### Multi-Tenant Setup
```typescript
// Tenant-specific configuration
const tenantConfigs = {
  'enterprise-corp': {
    hybridSearch: { vectorWeight: 0.8, keywordWeight: 0.2 },
    guardrails: { threshold: 0.2 }, // Permissive
    llm: { model: 'gpt-4.1-2025-04-14-turbo' },
    reranker: { enabled: true }
  },
  'strict-compliance': {
    hybridSearch: { vectorWeight: 0.6, keywordWeight: 0.4 },
    guardrails: { threshold: 0.5 }, // Strict
    llm: { model: 'claude-3-sonnet' },
    reranker: { enabled: true }
  },
  'cost-optimized': {
    hybridSearch: { vectorWeight: 0.9, keywordWeight: 0.1 },
    guardrails: { threshold: 0.3 },
    llm: { model: 'gpt-3.5-turbo' },
    reranker: { enabled: false }
  }
};
```

---

## 📊 Monitoring & Alerting

### Health Monitoring

#### Service Health Checks
```bash
#!/bin/bash
# health-check.sh

# API Service
api_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/healthz)
echo "API Health: $api_health"

# Qdrant
qdrant_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:6333/health)
echo "Qdrant Health: $qdrant_health"

# Reranker
reranker_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/health)
echo "Reranker Health: $reranker_health"

# Embeddings
embeddings_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
echo "Embeddings Health: $embeddings_health"

# Check if all services are healthy
if [[ $api_health == "200" && $qdrant_health == "200" && $reranker_health == "200" && $embeddings_health == "200" ]]; then
    echo "✅ All services healthy"
    exit 0
else
    echo "❌ Some services unhealthy"
    exit 1
fi
```

#### Performance Monitoring
```typescript
// monitoring/metrics.ts
interface SystemMetrics {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    concurrentRequests: number;
  };
  components: {
    hybridSearch: ComponentMetrics;
    reranker: ComponentMetrics;
    guardrails: ComponentMetrics;
    synthesis: ComponentMetrics;
  };
  quality: {
    answerRelevance: number;
    citationAccuracy: number;
    idkPrecision: number;
  };
}
```

### Alerting Configuration

#### Prometheus Alerts
```yaml
# alerts.yml
groups:
  - name: cw-rag-core
    rules:
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 5
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"

      - alert: LowAnswerQuality
        expr: answer_relevance_score < 0.8
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Answer quality below threshold"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"
```

#### Slack Integration
```bash
# webhook-alerts.sh
SLACK_WEBHOOK="your-slack-webhook-url"

send_alert() {
    local message="$1"
    local severity="$2"

    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"🚨 CW RAG Core Alert [$severity]: $message\"}" \
        $SLACK_WEBHOOK
}

# Usage
send_alert "High response time detected: 5.2s" "WARNING"
```

---

## 📈 Performance Tuning

### Database Optimization

#### Qdrant Tuning
```bash
# Optimize for production workload
curl -X PUT "http://localhost:6333/collections/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "default_segment_number": 4,
      "max_segment_size": 20000000,
      "indexing_threshold": 10000
    },
    "quantization_config": {
      "scalar": {
        "type": "int8",
        "quantile": 0.99
      }
    }
  }'
```

#### Index Optimization
```sql
-- Qdrant index tuning
CREATE INDEX IF NOT EXISTS tenant_idx ON points (tenant_id);
CREATE INDEX IF NOT EXISTS acl_idx ON points (acl);
CREATE INDEX IF NOT EXISTS lang_idx ON points (lang);
```

### Application Tuning

#### Node.js Optimization
```bash
# Optimized Node.js settings
export NODE_OPTIONS="--max-old-space-size=2048 --max-new-space-size=512"
export UV_THREADPOOL_SIZE=16
```

#### Connection Pool Tuning
```typescript
// Database connection pool
const poolConfig = {
  min: 5,
  max: 25,
  acquireTimeoutMillis: 5000,
  idleTimeoutMillis: 300000,
  reapIntervalMillis: 1000
};
```

### Caching Strategy

#### Redis Configuration
```redis
# redis.conf optimizations
maxmemory 1gb
maxmemory-policy allkeys-lru
timeout 300
tcp-keepalive 60
```

#### Application Caching
```typescript
// Multi-level caching strategy
const cacheConfig = {
  levels: [
    { type: 'memory', ttl: 60, size: 1000 },    // L1: In-memory
    { type: 'redis', ttl: 300, size: 10000 },   // L2: Redis
    { type: 'disk', ttl: 3600, size: 100000 }   // L3: Disk
  ]
};
```

---

## 🛠️ Troubleshooting

### Common Issues

#### 1. Reranker Service Issues
```bash
# Check reranker logs
docker logs cw-rag-reranker

# Restart reranker
docker-compose restart reranker

# Test reranker directly
curl -X POST http://localhost:8081/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test query",
    "documents": [
      {"id": "1", "content": "test document"}
    ]
  }'
```

#### 2. LLM Integration Issues
```bash
# Check API key configuration
echo $OPENAI_API_KEY

# Test LLM connectivity
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-2025-04-14-turbo",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10
  }'
```

#### 3. Memory Issues
```bash
# Check memory usage
docker stats

# Optimize memory settings
docker-compose down
# Edit .env to reduce batch sizes
# RERANKER_BATCH_SIZE=16
# LLM_MAX_TOKENS=250
docker-compose up -d
```

#### 4. Performance Issues
```bash
# Enable debug logging
export LOG_LEVEL=debug
docker-compose restart api

# Monitor performance
curl http://localhost:3000/metrics

# Check component timings
curl -X POST http://localhost:3000/ask?includeMetrics=true
```

### Diagnostic Commands

#### System Diagnostics
```bash
# Check system resources
htop
iotop
netstat -tulpn

# Check Docker resources
docker system df
docker system prune

# Check service logs
docker-compose logs api
docker-compose logs reranker
docker-compose logs qdrant
```

#### Performance Diagnostics
```bash
# Load testing
ab -n 100 -c 10 -p test-payload.json -T application/json \
   http://localhost:3000/ask

# Memory profiling
docker exec cw-rag-api npm run profile

# CPU profiling
docker exec cw-rag-api node --prof index.js
```

---

## 🔄 Backup & Recovery

### Data Backup

#### Qdrant Backup
```bash
# Create Qdrant snapshot
curl -X POST "http://localhost:6333/collections/documents/snapshots"

# Download snapshot
snapshot_name=$(curl -s "http://localhost:6333/collections/documents/snapshots" | jq -r '.result[-1].name')
curl -o "backup-$(date +%Y%m%d).snapshot" \
     "http://localhost:6333/collections/documents/snapshots/$snapshot_name"
```

#### Configuration Backup
```bash
# Backup configuration
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
    .env \
    docker-compose.yml \
    apps/api/config/ \
    n8n/workflows/
```

#### Automated Backup Script
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/cw-rag-core"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR/$DATE"

# Backup Qdrant data
docker exec cw-rag-qdrant tar -czf /tmp/qdrant-$DATE.tar.gz /qdrant/storage
docker cp cw-rag-qdrant:/tmp/qdrant-$DATE.tar.gz "$BACKUP_DIR/$DATE/"

# Backup configurations
cp .env "$BACKUP_DIR/$DATE/"
cp docker-compose.yml "$BACKUP_DIR/$DATE/"

# Backup evaluation results
cp -r eval-results "$BACKUP_DIR/$DATE/"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*" -type d -mtime +7 -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR/$DATE"
```

### Disaster Recovery

#### Recovery Procedure
```bash
# 1. Stop all services
docker-compose down

# 2. Restore Qdrant data
docker volume rm cw-rag-qdrant_data
docker volume create cw-rag-qdrant_data
tar -xzf qdrant-backup.tar.gz -C /var/lib/docker/volumes/cw-rag-qdrant_data/_data/

# 3. Restore configuration
cp backup/.env .env
cp backup/docker-compose.yml docker-compose.yml

# 4. Restart services
docker-compose up -d

# 5. Verify recovery
curl http://localhost:3000/healthz
curl http://localhost:6334/collections/documents
```

---

## 🔐 Security Configuration

### Production Security

#### SSL/TLS Configuration
```yaml
# Add to docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - api
      - web
```

#### Environment Security
```bash
# Secure environment variables
chmod 600 .env
chown root:root .env

# Use Docker secrets for sensitive data
echo "your-openai-key" | docker secret create openai_key -
```

#### Network Security
```yaml
# Restricted network access
networks:
  app_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Access Control

#### API Rate Limiting
```typescript
// Rate limiting configuration
const rateLimitConfig = {
  windowMs: 60 * 1000,        // 1 minute
  max: 100,                   // limit each IP to 100 requests per windowMs
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false
};
```

#### CORS Configuration
```typescript
// CORS settings
const corsConfig = {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
};
```

---

## 📋 Operational Procedures

### Daily Operations

#### Morning Checks
```bash
#!/bin/bash
# daily-check.sh

echo "=== Daily CW RAG Core Health Check ==="
date

# Check service health
./health-check.sh

# Check performance metrics
curl -s http://localhost:3000/metrics | grep -E "(response_time|error_rate|throughput)"

# Check disk usage
df -h | grep -E "(qdrant|redis)"

# Check recent errors
docker-compose logs --since=24h | grep -i error | wc -l

echo "=== Daily check complete ==="
```

#### Weekly Maintenance
```bash
#!/bin/bash
# weekly-maintenance.sh

# Clean up old logs
docker-compose logs --since=7d > weekly-logs-$(date +%Y%m%d).log
docker system prune -f

# Update performance baselines
curl -X POST http://localhost:3000/admin/update-baselines

# Run evaluation suite
docker-compose --profile evaluation run --rm evaluation

# Generate weekly report
./generate-weekly-report.sh

echo "Weekly maintenance complete"
```

### Scaling Procedures

#### Horizontal Scaling
```bash
# Scale API service
docker-compose up -d --scale api=3

# Add load balancer
docker-compose -f docker-compose.yml -f docker-compose.lb.yml up -d

# Verify scaling
curl http://localhost:3000/healthz
```

#### Vertical Scaling
```yaml
# Update resource limits
services:
  api:
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
```

---

## 📚 Additional Resources

### Documentation Links
- [Phase 2 Features Guide](phase2-features.md)
- [Performance Benchmarks](performance-benchmarks.md)
- [API Documentation](../README.md#api-reference)
- [Evaluation Framework](evaluation/README.md)

### External Dependencies
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [Sentence Transformers](https://www.sbert.net/)
- [LangChain.js](https://js.langchain.com/)
- [OpenAI API](https://platform.openai.com/docs)

### Support Channels
- GitHub Issues: [Project Issues](https://github.com/your-org/cw-rag-core/issues)
- Documentation: [Project Wiki](https://github.com/your-org/cw-rag-core/wiki)
- Community: [Discussions](https://github.com/your-org/cw-rag-core/discussions)

---

*This deployment guide covers the complete Phase 2 production deployment. For development setup, see the [main README](../README.md). For troubleshooting specific issues, consult the [troubleshooting section](#-troubleshooting) above.*