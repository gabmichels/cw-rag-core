# RUNBOOK: Retrieval & Answer Synthesis Operations

## Overview

This runbook provides operational procedures for the CW RAG Core Phase 2 retrieval and answer synthesis system. It covers monitoring, troubleshooting, configuration management, and performance optimization for production deployments.

## System Components

### Core Services
- **Hybrid Search Engine**: Vector + keyword search with RRF fusion
- **Cross-Encoder Reranker**: HTTP-based reranking with fallback support
- **LLM Answer Synthesis**: Streaming response generation with citations
- **Answerability Guardrails**: Confidence-based filtering
- **Enhanced RBAC**: Multi-tenant access controls

### Service Dependencies
- **Qdrant**: Vector database (port 6333/6334)
- **Embedding Service**: BGE-small-en-v1.5 (configurable endpoint)
- **Reranker Service**: HTTP-based reranking (configurable endpoint)
- **LLM Service**: OpenAI-compatible API (configurable endpoint)

## Health Monitoring

### Service Health Checks

```bash
#!/bin/bash
# health-check.sh - Comprehensive service health validation

echo "=== CW RAG Core Health Check ==="

# API Health
API_HEALTH=$(curl -s http://localhost:3000/healthz | jq -r '.status')
echo "API Health: $API_HEALTH"

# API Readiness (includes Qdrant connectivity)
API_READY=$(curl -s http://localhost:3000/readyz | jq -r '.status')
echo "API Readiness: $API_READY"

# Qdrant Direct Health
QDRANT_HEALTH=$(curl -s http://localhost:6333/healthz | jq -r '.status // "ok"')
echo "Qdrant Health: $QDRANT_HEALTH"

# Test hybrid search functionality
TEST_SEARCH=$(curl -s -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "health check test",
    "userContext": {
      "id": "healthcheck",
      "groupIds": ["public"],
      "tenantId": "system"
    },
    "k": 1
  }' | jq -r '.queryId // "failed"')

if [[ "$TEST_SEARCH" != "failed" ]]; then
  echo "Search Pipeline: ✅ OPERATIONAL"
else
  echo "Search Pipeline: ❌ FAILED"
fi
```

### Key Metrics to Monitor

1. **Response Times**:
   - `/ask` endpoint: Target <500ms p95
   - Hybrid search: Target <200ms p95
   - LLM synthesis: Target <2000ms p95

2. **Error Rates**:
   - Overall API errors: Target <1%
   - Guardrail rejections: Monitor trend
   - Service timeout rate: Target <5%

3. **Resource Usage**:
   - Memory: API <512MB, Qdrant <2GB
   - CPU: Monitor during peak loads
   - Disk: Qdrant vector storage growth

## Configuration Management

### Environment Variables

#### Core Retrieval Settings
```bash
# Hybrid Search Configuration
HYBRID_SEARCH_ENABLED=true
VECTOR_WEIGHT=0.7
KEYWORD_WEIGHT=0.3
RRF_K=60

# Reranker Configuration
RERANKER_ENABLED=true
RERANKER_URL=http://reranker:8000
RERANKER_TIMEOUT_MS=5000
RERANKER_FALLBACK_ENABLED=true

# LLM Configuration
LLM_ENABLED=true
LLM_URL=http://llm-service:8000
LLM_TIMEOUT_MS=10000
LLM_STREAMING_ENABLED=true

# Answerability Guardrails
ANSWERABILITY_THRESHOLD=0.5
CONFIDENCE_CALCULATION_METHOD=mean_of_top_chunks
```

#### Timeout and Retry Settings
```bash
# Service Timeouts (milliseconds)
EMBEDDING_TIMEOUT_MS=3000
QDRANT_TIMEOUT_MS=2000
RERANKER_TIMEOUT_MS=5000
LLM_TIMEOUT_MS=10000

# Retry Configuration
EMBEDDING_RETRY_COUNT=3
QDRANT_RETRY_COUNT=2
RERANKER_RETRY_COUNT=2
LLM_RETRY_COUNT=1

# Circuit Breaker Settings
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_ERROR_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=30000
```

### Runtime Configuration Updates

#### Reranker Toggle
```bash
# Disable reranking (fallback to hybrid search only)
curl -X POST http://localhost:3000/config/reranker \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Re-enable with custom timeout
curl -X POST http://localhost:3000/config/reranker \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "timeoutMs": 3000}'
```

#### LLM Synthesis Toggle
```bash
# Disable LLM synthesis (return search results only)
curl -X POST http://localhost:3000/config/llm \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Enable streaming with custom model
curl -X POST http://localhost:3000/config/llm \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "streaming": true, "model": "gpt-4.1-2025-04-14"}'
```

## Troubleshooting Guide

### Common Issues

#### 1. "Bad Answers" or Low Quality Responses

**Symptoms**: Users report irrelevant or poor quality answers

**Diagnosis Steps**:
```bash
# Check answerability guardrail stats
curl -s http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "problematic query here",
    "userContext": {"id": "debug", "groupIds": ["public"], "tenantId": "debug"},
    "debug": true
  }' | jq '.guardrailDecision'

# Review confidence scores and thresholds
# Expected: confidence < answerability_threshold = "I don't know" response
```

**Common Fixes**:
- **Low Confidence**: Increase answerability threshold (0.3 → 0.5)
- **Poor Retrieval**: Check hybrid search weights, increase `topK`
- **Reranker Issues**: Verify reranker service health, check timeout logs
- **Stale Content**: Check document freshness, trigger re-ingestion

#### 2. Reranker Service Failures

**Symptoms**: Reranker timeouts, degraded search quality

**Diagnosis**:
```bash
# Check reranker service health
curl -s http://reranker-service:8000/health

# Test reranker directly
curl -X POST http://reranker-service:8000/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test query",
    "documents": [{"id": "test", "content": "test content"}]
  }'

# Check API logs for reranker timeouts
docker logs cw-rag-api | grep -i reranker
```

**Fallback Procedures**:
```bash
# Temporarily disable reranker (hybrid search continues)
export RERANKER_ENABLED=false
docker-compose restart api

# Increase timeout for slow reranker
export RERANKER_TIMEOUT_MS=10000
docker-compose restart api
```

#### 3. LLM Synthesis Issues

**Symptoms**: No synthesized answers, timeout errors, malformed responses

**Diagnosis**:
```bash
# Test LLM service directly
curl -X POST http://llm-service:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -d '{
    "model": "gpt-4.1-2025-04-14",
    "messages": [{"role": "user", "content": "Test message"}],
    "stream": false
  }'

# Check API synthesis logs
docker logs cw-rag-api | grep -i synthesis
```

**Common Fixes**:
- **API Key Issues**: Verify `LLM_API_KEY` environment variable
- **Rate Limiting**: Check LLM service quotas and limits
- **Timeout Errors**: Increase `LLM_TIMEOUT_MS` or disable streaming
- **Malformed Responses**: Check LLM model compatibility

#### 4. Performance Degradation

**Symptoms**: Slow response times, high error rates

**Performance Analysis**:
```bash
# Measure component performance
time curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "performance test",
    "userContext": {"id": "perf", "groupIds": ["public"], "tenantId": "test"}
  }'

# Check Qdrant performance
curl http://localhost:6333/metrics

# Monitor API metrics
curl http://localhost:3000/metrics
```

**Optimization Steps**:
1. **Reduce topK**: Lower initial retrieval count (25 → 15)
2. **Adjust Timeouts**: Balance speed vs reliability
3. **Disable Features**: Temporarily disable reranker or LLM synthesis
4. **Scale Services**: Add more reranker/LLM service instances

### Service Fallback Procedures

#### Reranker Service Down
```bash
# Automatic: System continues with hybrid search ranking
# Manual override: Force disable reranking
export RERANKER_ENABLED=false

# Monitor degraded mode performance
curl -s http://localhost:3000/ask \
  -d '{"query": "test", "userContext": {...}}' | \
  jq '.retrievedDocuments | length'
```

#### LLM Service Down
```bash
# Automatic: System returns search results without synthesis
# Response includes raw documents and citations
# Manual: Adjust synthesis timeout
export LLM_TIMEOUT_MS=3000

# Verify search-only mode
curl -s http://localhost:3000/ask \
  -d '{"query": "test", "userContext": {...}}' | \
  jq 'has("answer")'  # Should be false in degraded mode
```

#### Embedding Service Issues
```bash
# Check embedding service health
curl http://embeddings:80/health

# Fallback to keyword-only search
export VECTOR_SEARCH_ENABLED=false

# Monitor keyword-only performance
curl -s http://localhost:3000/ask \
  -d '{"query": "test", "userContext": {...}}' | \
  jq '.retrievedDocuments[].searchType'  # Should show "keyword_only"
```

## Performance Tuning

### Hybrid Search Optimization

#### Weight Tuning
```bash
# For document-heavy workloads (favor semantic similarity)
export VECTOR_WEIGHT=0.8
export KEYWORD_WEIGHT=0.2

# For query-heavy workloads (favor keyword matching)
export VECTOR_WEIGHT=0.5
export KEYWORD_WEIGHT=0.5

# For balanced workloads
export VECTOR_WEIGHT=0.7
export KEYWORD_WEIGHT=0.3
```

#### RRF Configuration
```bash
# Aggressive ranking (favors top results)
export RRF_K=30

# Conservative ranking (more balanced)
export RRF_K=60

# Gentle ranking (broader result distribution)
export RRF_K=100
```

### Reranker Optimization

#### Batch Size Tuning
```bash
# For low-latency requirements
export RERANKER_BATCH_SIZE=10

# For throughput optimization
export RERANKER_BATCH_SIZE=50

# For memory-constrained environments
export RERANKER_BATCH_SIZE=5
```

#### Model Selection
```bash
# Fast but less accurate
export RERANKER_MODEL=bge-reranker-base

# Balanced performance
export RERANKER_MODEL=bge-reranker-large

# High accuracy (slower)
export RERANKER_MODEL=cross-encoder-ms-marco-electra-base
```

## Security Operations

### RBAC Monitoring

#### Access Pattern Analysis
```bash
# Monitor RBAC enforcement
tail -f /var/log/api/audit.log | grep rbac

# Check for access violations
grep "RBAC_VIOLATION" /var/log/api/audit.log | tail -10

# Analyze tenant access patterns
curl http://localhost:3000/admin/rbac/stats | jq '.tenantStats'
```

#### Emergency Access Controls
```bash
# Temporarily restrict tenant access
curl -X POST http://localhost:3000/admin/tenant/restrict \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tenantId": "problematic-tenant", "reason": "security investigation"}'

# Emergency shutdown of tenant
curl -X POST http://localhost:3000/admin/tenant/disable \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tenantId": "compromised-tenant"}'
```

### Audit Trail Management

#### Log Rotation
```bash
# Archive old audit logs
tar -czf audit-$(date +%Y%m%d).tar.gz /var/log/api/audit.log
mv /var/log/api/audit.log /var/log/api/audit.log.$(date +%Y%m%d)
touch /var/log/api/audit.log
```

#### Security Analysis
```bash
# Failed authentication attempts
grep "AUTH_FAILURE" /var/log/api/audit.log | wc -l

# Suspicious query patterns
grep -E "(injection|bypass|hack)" /var/log/api/audit.log

# Large result set requests (potential data exfiltration)
grep "retrievedDocuments.*count.*[5-9][0-9]" /var/log/api/audit.log
```

## Backup and Recovery

### Vector Database Backup

#### Automated Backup
```bash
#!/bin/bash
# backup-qdrant.sh - Automated Qdrant backup

BACKUP_DIR="/backup/qdrant/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Create Qdrant snapshot
SNAPSHOT_ID=$(curl -X POST http://localhost:6333/collections/documents/snapshots | jq -r '.result.name')

# Wait for snapshot completion
sleep 30

# Download snapshot
curl "http://localhost:6333/collections/documents/snapshots/$SNAPSHOT_ID" \
  -o "$BACKUP_DIR/documents-snapshot.dat"

echo "Qdrant backup completed: $BACKUP_DIR/documents-snapshot.dat"
```

#### Restore Procedure
```bash
#!/bin/bash
# restore-qdrant.sh - Restore from Qdrant snapshot

BACKUP_FILE="$1"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file>"
  exit 1
fi

# Stop API to prevent writes during restore
docker-compose stop api

# Delete existing collection
curl -X DELETE http://localhost:6333/collections/documents

# Upload and restore snapshot
curl -X POST http://localhost:6333/collections/documents/snapshots/upload \
  -F "snapshot=@$BACKUP_FILE"

# Restart API
docker-compose start api

echo "Restore completed from: $BACKUP_FILE"
```

### Configuration Backup

```bash
# Backup environment configuration
env | grep -E "(RERANKER|LLM|HYBRID|GUARDRAIL)" > config-backup-$(date +%Y%m%d).env

# Backup Docker configuration
cp docker-compose.yml docker-compose-backup-$(date +%Y%m%d).yml
```

## Monitoring and Alerting

### Key Performance Indicators

#### Response Time Monitoring
```bash
# Monitor API response times
while true; do
  RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}\n" \
    -X POST http://localhost:3000/ask \
    -H "Content-Type: application/json" \
    -d '{"query": "monitoring test", "userContext": {"id": "monitor", "groupIds": ["public"], "tenantId": "system"}}')

  echo "$(date): Response time: ${RESPONSE_TIME}s"

  if (( $(echo "$RESPONSE_TIME > 1.0" | bc -l) )); then
    echo "⚠️ SLOW RESPONSE DETECTED: ${RESPONSE_TIME}s"
  fi

  sleep 60
done
```

#### Error Rate Tracking
```bash
# Count errors in last hour
ERRORS=$(grep "$(date +'%Y-%m-%d %H')" /var/log/api/access.log | grep -c " 5[0-9][0-9] ")
TOTAL=$(grep "$(date +'%Y-%m-%d %H')" /var/log/api/access.log | wc -l)

if [[ $TOTAL -gt 0 ]]; then
  ERROR_RATE=$(echo "scale=2; $ERRORS * 100 / $TOTAL" | bc)
  echo "Error rate last hour: $ERROR_RATE%"

  if (( $(echo "$ERROR_RATE > 5.0" | bc -l) )); then
    echo "🚨 HIGH ERROR RATE ALERT: $ERROR_RATE%"
  fi
fi
```

### Alerting Rules

#### Critical Alerts
- API service down (health check fails)
- Qdrant connection lost
- Error rate >10% for 5+ minutes
- Response time >2s p95 for 10+ minutes

#### Warning Alerts
- Reranker service degraded (using fallback)
- LLM service timeouts >20%
- Memory usage >80% for 15+ minutes
- Disk usage >85%

## Operational Procedures

### Service Restart Procedures

#### Rolling Restart (Zero Downtime)
```bash
# Scale up API instances
docker-compose up -d --scale api=2

# Wait for health check
sleep 30

# Scale down old instance
docker-compose up -d --scale api=1

# Verify service health
curl http://localhost:3000/healthz
```

#### Emergency Restart
```bash
# Quick restart for critical issues
docker-compose restart api

# Full stack restart
docker-compose down
docker-compose up -d

# Verify all services
./health-check.sh
```

### Configuration Hot Reload

#### Update Retrieval Parameters
```bash
# Update hybrid search weights without restart
curl -X POST http://localhost:3000/admin/config/hybrid-search \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "vectorWeight": 0.8,
    "keywordWeight": 0.2,
    "rrfK": 50
  }'
```

#### Update Guardrail Thresholds
```bash
# Adjust answerability threshold
curl -X POST http://localhost:3000/admin/config/guardrails \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "answerabilityThreshold": 0.6,
    "confidenceMethod": "mean_of_top_chunks"
  }'
```

### Data Management

#### Purge Tenant Data
```bash
#!/bin/bash
# purge-tenant.sh - Complete tenant data removal

TENANT_ID="$1"
if [[ -z "$TENANT_ID" ]]; then
  echo "Usage: $0 <tenant-id>"
  exit 1
fi

echo "🗑️ Purging all data for tenant: $TENANT_ID"

# Delete vectors from Qdrant
curl -X POST http://localhost:6333/collections/documents/points/delete \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "must": [{"key": "tenant", "match": {"value": "'$TENANT_ID'"}}]
    }
  }'

# Clean audit logs
grep -v "tenant.*$TENANT_ID" /var/log/api/audit.log > /tmp/audit-clean.log
mv /tmp/audit-clean.log /var/log/api/audit.log

echo "✅ Tenant purge completed: $TENANT_ID"
```

## Debug Procedures

### Debug Mode Request
```bash
# Enable debug output for troubleshooting
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "debug test query",
    "userContext": {
      "id": "debug-user",
      "groupIds": ["public"],
      "tenantId": "debug"
    },
    "debug": true,
    "reranker": {"enabled": true, "debug": true},
    "synthesis": {"enabled": true, "debug": true}
  }' | jq '.'
```

### Component Testing

#### Test Hybrid Search Only
```bash
# Bypass guardrails and synthesis for pure search testing
curl -X POST http://localhost:3000/admin/debug/search \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "query": "test query",
    "tenantId": "debug",
    "bypassGuardrails": true,
    "bypassSynthesis": true
  }'
```

#### Test Reranker Only
```bash
# Test reranking with specific documents
curl -X POST http://localhost:3000/admin/debug/rerank \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "query": "test query",
    "documents": [
      {"id": "doc1", "content": "relevant content"},
      {"id": "doc2", "content": "less relevant content"}
    ]
  }'
```

## Maintenance Procedures

### Weekly Maintenance

1. **Performance Review**:
   - Check response time trends
   - Review error logs for patterns
   - Validate backup completion

2. **Configuration Validation**:
   - Verify service endpoints
   - Test fallback procedures
   - Update monitoring thresholds

3. **Capacity Planning**:
   - Monitor Qdrant storage growth
   - Check API memory usage trends
   - Review concurrent user patterns

### Monthly Maintenance

1. **Security Review**:
   - Rotate API tokens
   - Review RBAC logs for anomalies
   - Update security configurations

2. **Performance Optimization**:
   - Analyze slow query patterns
   - Optimize hybrid search weights
   - Update reranker model if available

3. **Data Hygiene**:
   - Archive old audit logs
   - Clean up test tenant data
   - Validate vector database integrity

## Emergency Procedures

### System-Wide Outage

1. **Immediate Response**:
   ```bash
   # Check all service health
   docker-compose ps

   # Quick restart attempt
   docker-compose restart

   # If failed, full rebuild
   docker-compose down
   docker-compose up --build -d
   ```

2. **Service Isolation**:
   ```bash
   # Disable non-essential features
   export RERANKER_ENABLED=false
   export LLM_ENABLED=false
   docker-compose restart api

   # Verify basic search functionality
   curl http://localhost:3000/ask -d '{"query": "emergency test", ...}'
   ```

### Data Corruption

1. **Detection**:
   ```bash
   # Check Qdrant collection integrity
   curl http://localhost:6333/collections/documents | jq '.result.points_count'

   # Verify API can retrieve documents
   curl http://localhost:3000/ask -d '{"query": "test", ...}' | jq '.retrievedDocuments | length'
   ```

2. **Recovery**:
   ```bash
   # Restore from latest backup
   ./restore-qdrant.sh /backup/qdrant/latest/documents-snapshot.dat

   # Re-ingest critical documents
   curl -X POST http://localhost:3000/ingest/publish \
     -H "x-ingest-token: $INGEST_TOKEN" \
     -d @critical-documents.json
   ```

## Contact Information

### Escalation Path
1. **L1 Support**: Development team (operational issues)
2. **L2 Support**: Platform team (infrastructure issues)
3. **L3 Support**: Architecture team (design issues)

### Key Contacts
- **Operations Lead**: [Contact information]
- **Development Lead**: [Contact information]
- **Security Team**: [Contact information]

---

*This runbook is maintained by the CW RAG Core operations team. Last updated: Phase 2 completion (2025-09-22)*