# Token-Aware Embedding Service Deployment Guide

## Overview

This guide covers the deployment of the enhanced token-aware embedding service with intelligent chunking, configuration management, and monitoring capabilities.

## Quick Start

### 1. Environment Setup

Create or update your `.env` file:

```bash
# Core embedding configuration
EMBEDDING_PROVIDER=bge
EMBEDDING_MODEL=bge-small-en-v1.5
EMBEDDING_URL=http://embeddings:80
EMBEDDING_MAX_TOKENS=460
EMBEDDING_CHUNKING_STRATEGY=token-aware

# Safety and reliability
EMBEDDING_SAFETY_MARGIN=0.1
EMBEDDING_RETRY_MAX_ATTEMPTS=3
EMBEDDING_TIMEOUT_MS=5000

# Chunking configuration
EMBEDDING_OVERLAP_TOKENS=50
EMBEDDING_MIN_CHUNK_TOKENS=50
EMBEDDING_CHAR_TO_TOKEN_RATIO=3.2

# Debug and monitoring
EMBEDDING_DEBUG_LOGGING=false
LOG_LEVEL=info
```

### 2. Docker Deployment

```bash
# Start the enhanced system
docker-compose up -d

# Verify services are running
docker-compose ps

# Check embedding service health
curl http://localhost:8080/health

# Test token-aware chunking
curl -X POST http://localhost:3000/ingest/publish \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: your-token-here" \
  -d @test-document.json
```

### 3. Verification

Monitor structured logs for token awareness:

```bash
# Watch for chunking decisions
docker logs cw-rag-zenithfall-api | grep "ChunkingDecision"

# Monitor embedding metrics
docker logs cw-rag-zenithfall-api | grep "EmbeddingServiceSuccess"

# Check for any 413 errors (should be eliminated)
docker logs cw-rag-zenithfall-api | grep "413"
```

## Configuration Reference

### Environment Variables

#### Core Embedding Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | `bge` | Embedding service provider (`bge`, `openai`, `azure`, `custom`) |
| `EMBEDDING_MODEL` | `bge-small-en-v1.5` | Model identifier for the embedding service |
| `EMBEDDING_URL` | `http://embeddings:80` | Embedding service endpoint URL |
| `EMBEDDING_MAX_TOKENS` | `460` | Maximum tokens per chunk (90% of service limit) |

#### Token Management

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_SAFETY_MARGIN` | `0.1` | Safety buffer percentage (0.1 = 10%) |
| `EMBEDDING_CHAR_TO_TOKEN_RATIO` | `3.2` | Character-to-token estimation ratio for BGE |
| `EMBEDDING_MIN_CHUNK_TOKENS` | `50` | Minimum tokens required per chunk |

#### Chunking Strategy

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_CHUNKING_STRATEGY` | `token-aware` | Chunking strategy (`token-aware`, `paragraph`, `character`) |
| `EMBEDDING_OVERLAP_TOKENS` | `50` | Token overlap between consecutive chunks |

#### Reliability & Performance

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_RETRY_MAX_ATTEMPTS` | `3` | Maximum retry attempts for failed requests |
| `EMBEDDING_TIMEOUT_MS` | `5000` | Request timeout in milliseconds |
| `EMBEDDING_BATCH_SIZE` | `32` | Maximum batch size for parallel processing |

#### Monitoring & Debug

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_DEBUG_LOGGING` | `false` | Enable detailed chunking and token counting logs |
| `LOG_LEVEL` | `info` | Application log level (`debug`, `info`, `warn`, `error`) |

### Advanced Configuration

#### Multiple Embedding Services

For production environments supporting multiple embedding services:

```bash
# Primary service (BGE)
EMBEDDING_PROVIDER=bge
EMBEDDING_MODEL=bge-small-en-v1.5
EMBEDDING_MAX_TOKENS=460

# Fallback service (OpenAI)
EMBEDDING_FALLBACK_PROVIDER=openai
EMBEDDING_FALLBACK_MODEL=text-embedding-ada-002
EMBEDDING_FALLBACK_MAX_TOKENS=7372
```

#### Performance Tuning

For high-volume environments:

```bash
# Increased batch processing
EMBEDDING_BATCH_SIZE=64
EMBEDDING_TIMEOUT_MS=15000

# Aggressive chunking for performance
EMBEDDING_CHUNKING_STRATEGY=character
EMBEDDING_CHAR_TO_TOKEN_RATIO=2.8  # More conservative estimation

# Reduced overlap for faster processing
EMBEDDING_OVERLAP_TOKENS=25
```

#### Development Environment

For development and testing:

```bash
# Relaxed limits for testing
EMBEDDING_MAX_TOKENS=512
EMBEDDING_SAFETY_MARGIN=0.05

# Detailed logging
EMBEDDING_DEBUG_LOGGING=true
LOG_LEVEL=debug

# Fast retries for development
EMBEDDING_RETRY_MAX_ATTEMPTS=2
EMBEDDING_TIMEOUT_MS=3000
```

## Deployment Scenarios

### 1. Development Environment

```bash
# Clone and setup
git clone <your-repo>
cd cw-rag-core

# Create development environment file
cp .env.example .env.development

# Update with development settings
EMBEDDING_DEBUG_LOGGING=true
EMBEDDING_MAX_TOKENS=512
EMBEDDING_SAFETY_MARGIN=0.05

# Start development stack
docker-compose -f docker-compose.yml --env-file .env.development up -d
```

### 2. Production Environment

```bash
# Production environment setup
cp .env.example .env.production

# Configure for production
EMBEDDING_CHUNKING_STRATEGY=token-aware
EMBEDDING_MAX_TOKENS=460
EMBEDDING_SAFETY_MARGIN=0.1
EMBEDDING_RETRY_MAX_ATTEMPTS=5
EMBEDDING_DEBUG_LOGGING=false

# Deploy with production settings
docker-compose --env-file .env.production up -d
```

### 3. Multi-Tenant Environment

```bash
# Tenant-specific configuration
TENANT=customer1
PROJECT_PREFIX=customer1-rag

# Tenant-specific token limits
EMBEDDING_MAX_TOKENS=400  # Conservative for shared resources
EMBEDDING_BATCH_SIZE=16   # Smaller batches for multi-tenancy

# Deploy tenant instance
docker-compose --env-file .env.customer1 up -d
```

### 4. High-Availability Setup

```bash
# Load balancer configuration
EMBEDDING_URL=http://embedding-lb:80  # Load balancer endpoint

# Redundant retry configuration
EMBEDDING_RETRY_MAX_ATTEMPTS=5
EMBEDDING_TIMEOUT_MS=10000

# Health check intervals
HEALTH_CHECK_INTERVAL=30s
HEALTH_CHECK_TIMEOUT=10s
HEALTH_CHECK_RETRIES=3
```

## Monitoring and Observability

### Structured Logging

The system generates structured logs for monitoring:

```json
{
  "timestamp": "2025-09-24T10:32:47.787Z",
  "level": "INFO",
  "message": "StructuredLog:ChunkingDecision",
  "originalLength": 2000,
  "tokenCount": 537,
  "chunkStrategy": "token-aware",
  "chunksCreated": 2,
  "maxTokensPerChunk": 460,
  "overlapTokens": 50
}
```

### Key Metrics to Monitor

1. **Chunking Metrics**:
   - Average chunks per document
   - Token count distribution
   - Chunking strategy success rate

2. **Embedding Service Metrics**:
   - Request success rate
   - Average response time
   - 413 error rate (should be 0%)

3. **Performance Metrics**:
   - Documents processed per minute
   - Average processing time per document
   - Retry attempt frequency

### Prometheus Metrics

Access Prometheus-formatted metrics:

```bash
curl http://localhost:3000/metrics
```

Example metrics:
```
# HELP embedding_requests_total Total number of embedding requests
embedding_requests_total{status="success"} 1543
embedding_requests_total{status="error"} 12

# HELP embedding_tokens_processed_total Total number of tokens processed
embedding_tokens_processed_total 45231

# HELP embedding_service_availability Service availability percentage
embedding_service_availability 0.99
```

### Grafana Dashboard

Import the provided Grafana dashboard for visualization:

```bash
# Import dashboard configuration
curl -X POST http://localhost:3001/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard.json
```

## Troubleshooting

### Common Issues

#### 1. Still Getting 413 Errors

**Symptoms**: HTTP 413 "Payload Too Large" errors in logs

**Solutions**:
```bash
# Reduce token limit further
EMBEDDING_MAX_TOKENS=400
EMBEDDING_SAFETY_MARGIN=0.15

# Switch to more aggressive chunking
EMBEDDING_CHUNKING_STRATEGY=character
EMBEDDING_CHAR_TO_TOKEN_RATIO=2.5

# Enable emergency fallback
EMBEDDING_EMERGENCY_FALLBACK=true
```

#### 2. Chunks Too Small, Losing Context

**Symptoms**: Many very small chunks, poor retrieval quality

**Solutions**:
```bash
# Increase minimum chunk size
EMBEDDING_MIN_CHUNK_TOKENS=75

# Increase overlap for better context
EMBEDDING_OVERLAP_TOKENS=75

# Use paragraph-aware chunking
EMBEDDING_CHUNKING_STRATEGY=paragraph
```

#### 3. Token Counting Inaccurate

**Symptoms**: Chunks still exceeding limits despite configuration

**Solutions**:
```bash
# Use more conservative ratio
EMBEDDING_CHAR_TO_TOKEN_RATIO=2.8

# Increase safety margin
EMBEDDING_SAFETY_MARGIN=0.2

# Enable debug logging to analyze
EMBEDDING_DEBUG_LOGGING=true
```

#### 4. Performance Issues

**Symptoms**: Slow document processing, timeouts

**Solutions**:
```bash
# Increase timeouts
EMBEDDING_TIMEOUT_MS=15000

# Reduce batch size
EMBEDDING_BATCH_SIZE=16

# Use character-based chunking for speed
EMBEDDING_CHUNKING_STRATEGY=character
```

### Debug Commands

```bash
# Check current configuration
curl http://localhost:3000/debug/embedding-config

# Test token counting
curl -X POST http://localhost:3000/debug/token-count \
  -H "Content-Type: application/json" \
  -d '{"text": "Your test text here"}'

# Analyze chunking for specific text
curl -X POST http://localhost:3000/debug/analyze-chunking \
  -H "Content-Type: application/json" \
  -d '{"text": "Your document text", "strategy": "token-aware"}'

# Get embedding service health
curl http://localhost:8080/health

# View recent metrics
curl http://localhost:3000/debug/embedding-metrics
```

### Log Analysis

```bash
# Find chunking decisions
docker logs cw-rag-zenithfall-api 2>&1 | grep "ChunkingDecision" | tail -10

# Check for errors
docker logs cw-rag-zenithfall-api 2>&1 | grep "ERROR" | tail -20

# Monitor embedding service calls
docker logs cw-rag-zenithfall-api 2>&1 | grep "EmbeddingService" | tail -15

# Performance analysis
docker logs cw-rag-zenithfall-api 2>&1 | grep "PerformanceRecorded" | tail -10
```

## Validation and Testing

### Post-Deployment Validation

```bash
# 1. Test small document (should work immediately)
curl -X POST http://localhost:3000/ingest/publish \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: your-token" \
  -d '{
    "meta": {
      "tenant": "test",
      "docId": "small-test",
      "source": "test",
      "sha256": "abc123",
      "acl": ["public"],
      "timestamp": "2025-09-24T10:00:00Z"
    },
    "blocks": [
      {"type": "text", "text": "This is a small test document."}
    ]
  }'

# 2. Test large document (should be chunked)
curl -X POST http://localhost:3000/ingest/publish \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: your-token" \
  -d @large-test-document.json

# 3. Test retrieval quality
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test question about your documents",
    "tenant": "test"
  }'
```

### Performance Testing

```bash
# Load test with multiple documents
for i in {1..10}; do
  curl -X POST http://localhost:3000/ingest/publish \
    -H "Content-Type: application/json" \
    -H "x-ingest-token: your-token" \
    -d @test-document-${i}.json &
done
wait

# Check processing times
docker logs cw-rag-zenithfall-api 2>&1 | grep "PerformanceRecorded" | tail -20
```

## Migration from Legacy System

See the [Migration Guide](../migration/embedding-service-migration.md) for detailed migration steps from the legacy character-based chunking system.

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly**: Review chunking metrics and adjust token limits if needed
2. **Monthly**: Analyze error logs and update configuration based on patterns
3. **Quarterly**: Review and update embedding service configurations for new models

### Configuration Updates

To update configuration without downtime:

```bash
# Update environment variables
docker-compose config > current-config.yml
# Edit configuration
docker-compose up -d --no-recreate
```

### Backup and Recovery

```bash
# Backup current configuration
docker-compose config > backup-config-$(date +%Y%m%d).yml

# Backup Qdrant data
docker exec cw-rag-zenithfall-qdrant tar czf /backup/qdrant-$(date +%Y%m%d).tar.gz /qdrant/data

# Restore from backup if needed
docker-compose down
docker volume rm cw_rag_zenithfall_qdrant_storage
docker-compose up -d
```

## Additional Resources

- [Configuration Schema Reference](../reference/embedding-config-schema.md)
- [Monitoring Setup Guide](../monitoring/embedding-service-monitoring.md)
- [Performance Tuning Guide](../performance/embedding-optimization.md)
- [API Documentation](../api/embedding-endpoints.md)