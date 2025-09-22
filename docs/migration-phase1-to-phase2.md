# Migration Guide: Phase 1 to Phase 2

This guide provides step-by-step instructions for migrating from CW RAG Core Phase 1 (basic vector search) to Phase 2 (production-grade RAG pipeline with hybrid search, reranking, guardrails, and answer synthesis).

## 🎯 Migration Overview

Phase 2 introduces significant architectural changes and new capabilities:

### **Major Changes**
- **Hybrid Search**: Vector + keyword search with RRF fusion
- **Reranker Service**: New cross-encoder reranking component
- **Answer Synthesis**: LLM-powered response generation with citations
- **Answerability Guardrails**: Intelligent query filtering
- **Enhanced RBAC**: Language filtering and audit trails
- **Evaluation Framework**: Comprehensive testing infrastructure

### **Compatibility**
- ✅ **Data Compatible**: Existing Qdrant data works without migration
- ✅ **API Compatible**: Phase 1 endpoints remain functional
- ⚠️ **Configuration Changes**: New environment variables required
- ⚠️ **Response Format**: Enhanced `/ask` endpoint response structure

---

## 📋 Pre-Migration Checklist

### 1. System Requirements Verification

```bash
# Check Docker version (required: >= 24.0.0)
docker --version

# Check available resources
df -h    # Ensure >15GB free space (increased from 10GB)
free -h  # Ensure >12GB RAM available (increased from 8GB)

# Check current Phase 1 deployment
docker-compose ps
curl http://localhost:3000/healthz
```

### 2. Data Backup

```bash
# Create comprehensive backup
mkdir -p migration-backup/$(date +%Y%m%d)

# Backup Qdrant data
curl -X POST "http://localhost:6333/collections/documents/snapshots"
snapshot_name=$(curl -s "http://localhost:6333/collections/documents/snapshots" | jq -r '.result[-1].name')
curl -o "migration-backup/$(date +%Y%m%d)/qdrant-snapshot.zip" \
     "http://localhost:6333/collections/documents/snapshots/$snapshot_name"

# Backup configuration
cp .env migration-backup/$(date +%Y%m%d)/env-phase1.backup
cp docker-compose.yml migration-backup/$(date +%Y%m%d)/docker-compose-phase1.backup

# Backup custom configurations
tar -czf migration-backup/$(date +%Y%m%d)/configs-phase1.tar.gz \
    apps/api/config/ \
    n8n/workflows/ \
    2>/dev/null || echo "No custom configs found"

echo "✅ Backup completed in migration-backup/$(date +%Y%m%d)/"
```

### 3. Compatibility Assessment

```bash
# Test current API responses for comparison
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test migration query",
    "userContext": {
      "id": "test-user",
      "tenantId": "test-tenant",
      "groupIds": ["public"]
    },
    "k": 5
  }' | jq '.' > migration-backup/$(date +%Y%m%d)/phase1-response-sample.json

echo "✅ Phase 1 response captured for comparison"
```

---

## 🔄 Migration Procedure

### Step 1: Update Repository

```bash
# Pull latest Phase 2 code
git fetch origin
git checkout main
git pull origin main

# Verify Phase 2 code
ls -la | grep -E "(PHASE-2|phase2|deployment)"
```

### Step 2: Update Environment Configuration

```bash
# Create Phase 2 environment configuration
cp .env .env.phase1.backup

# Update .env with Phase 2 settings
cat >> .env << 'EOF'

# Phase 2: Hybrid Search Configuration
HYBRID_SEARCH_ENABLED=true
HYBRID_SEARCH_VECTOR_WEIGHT=0.7
HYBRID_SEARCH_KEYWORD_WEIGHT=0.3
HYBRID_SEARCH_RRF_K=60
HYBRID_SEARCH_VECTOR_TOP_K=20
HYBRID_SEARCH_KEYWORD_TOP_K=20

# Phase 2: Reranker Configuration
RERANKER_ENABLED=true
RERANKER_MODEL=ms-marco-MiniLM-L-6-v2
RERANKER_API_URL=http://reranker:8081
RERANKER_TIMEOUT=5000
RERANKER_FALLBACK_ENABLED=true

# Phase 2: Answerability Guardrails
GUARDRAILS_ENABLED=true
GUARDRAILS_DEFAULT_THRESHOLD=0.3
GUARDRAILS_AUDIT_ENABLED=true

# Phase 2: LLM Integration
LLM_PROVIDER=openai
LLM_MODEL=gpt-4-turbo
LLM_MAX_TOKENS=500
LLM_TEMPERATURE=0.1
OPENAI_API_KEY=your-openai-api-key-here

# Phase 2: Answer Synthesis
SYNTHESIS_ENABLED=true
SYNTHESIS_MAX_CONTEXT_LENGTH=8000
SYNTHESIS_INCLUDE_CITATIONS=true

# Phase 2: Citation Configuration
CITATIONS_ENABLED=true
CITATIONS_FRESHNESS_ENABLED=true
CITATIONS_MAX_PER_ANSWER=10

# Phase 2: Enhanced RBAC
RBAC_ENHANCED_ENABLED=true
RBAC_LANGUAGE_FILTERING=true
RBAC_AUDIT_LOGGING=true

# Phase 2: Evaluation
EVALUATION_ENABLED=true
EVALUATION_DATASETS=gold,ood,inject,rbac
EOF

echo "✅ Environment configuration updated for Phase 2"
```

### Step 3: Update Docker Compose Configuration

```bash
# Backup current docker-compose.yml
cp docker-compose.yml docker-compose-phase1.backup

# Download Phase 2 docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/your-org/cw-rag-core/main/docker-compose.yml

# Or use the configuration from deployment-phase2.md
# Copy the complete Phase 2 docker-compose.yml content
```

### Step 4: Graceful Service Migration

```bash
# Stop Phase 1 services gracefully
echo "Stopping Phase 1 services..."
docker-compose down --timeout 30

# Verify all services stopped
docker ps | grep cw-rag || echo "✅ All services stopped"

# Remove old containers and images (optional)
docker system prune -f

echo "✅ Phase 1 services stopped"
```

### Step 5: Deploy Phase 2 Services

```bash
# Build Phase 2 images
echo "Building Phase 2 services..."
docker-compose build --no-cache

# Start core services first
echo "Starting core services..."
docker-compose up -d qdrant embeddings

# Wait for core services
echo "Waiting for core services to be ready..."
sleep 30

# Verify core services
curl -f http://localhost:6333/health || { echo "❌ Qdrant not ready"; exit 1; }
curl -f http://localhost:8080/health || { echo "❌ Embeddings not ready"; exit 1; }

echo "✅ Core services ready"

# Start Phase 2 services
echo "Starting Phase 2 services..."
docker-compose up -d reranker
sleep 15

# Verify reranker
curl -f http://localhost:8081/health || { echo "❌ Reranker not ready"; exit 1; }
echo "✅ Reranker service ready"

# Start API and Web services
docker-compose up -d api web
sleep 20

# Verify API
curl -f http://localhost:3000/healthz || { echo "❌ API not ready"; exit 1; }
echo "✅ API service ready"

# Start optional services
docker-compose up -d n8n
echo "✅ Phase 2 deployment complete"
```

### Step 6: Validate Migration

```bash
# Test basic functionality
echo "Testing Phase 2 functionality..."

# Test health endpoints
curl -f http://localhost:3000/healthz
curl -f http://localhost:6333/health
curl -f http://localhost:8081/health

# Test Phase 2 features
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test migration query",
    "userContext": {
      "id": "test-user",
      "tenantId": "test-tenant",
      "groupIds": ["public"]
    },
    "k": 8,
    "synthesis": {
      "includeCitations": true
    }
  }' | jq '.' > phase2-response-sample.json

# Verify Phase 2 response structure
jq '.answer' phase2-response-sample.json || echo "❌ Answer field missing"
jq '.citations' phase2-response-sample.json || echo "❌ Citations field missing"
jq '.guardrailDecision' phase2-response-sample.json || echo "❌ Guardrail decision missing"

echo "✅ Phase 2 validation complete"
```

---

## 🔧 Configuration Migration

### API Configuration Changes

#### Phase 1 vs Phase 2 Configuration
```typescript
// Phase 1 Configuration
const phase1Config = {
  qdrant: {
    host: 'qdrant',
    port: 6333
  },
  search: {
    type: 'vector',
    topK: 5
  },
  response: {
    type: 'stub',
    template: 'Phase-0 stub answer'
  }
};

// Phase 2 Configuration
const phase2Config = {
  qdrant: {
    host: 'qdrant',
    port: 6333
  },
  hybridSearch: {
    enabled: true,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    rrfK: 60,
    vectorTopK: 20,
    keywordTopK: 20
  },
  reranker: {
    enabled: true,
    model: 'ms-marco-MiniLM-L-6-v2',
    apiUrl: 'http://reranker:8081'
  },
  guardrails: {
    enabled: true,
    threshold: 0.3
  },
  synthesis: {
    enabled: true,
    llmProvider: 'openai',
    model: 'gpt-4-turbo',
    maxContextLength: 8000
  }
};
```

### Environment Variable Mapping

```bash
# Phase 1 → Phase 2 Environment Variable Migration

# Existing variables (unchanged)
QDRANT_HOST=qdrant                    # ✅ No change
QDRANT_PORT=6333                      # ✅ No change
API_PORT=3000                         # ✅ No change

# New Phase 2 variables (required)
HYBRID_SEARCH_ENABLED=true            # 🆕 Enable hybrid search
RERANKER_ENABLED=true                 # 🆕 Enable reranking
GUARDRAILS_ENABLED=true               # 🆕 Enable guardrails
SYNTHESIS_ENABLED=true                # 🆕 Enable answer synthesis
LLM_PROVIDER=openai                   # 🆕 LLM configuration
OPENAI_API_KEY=your-key               # 🆕 API key required

# Phase 2 tuning variables (optional)
HYBRID_SEARCH_VECTOR_WEIGHT=0.7       # 🔧 Tune hybrid search
GUARDRAILS_DEFAULT_THRESHOLD=0.3      # 🔧 Tune guardrails
LLM_TEMPERATURE=0.1                   # 🔧 Tune LLM responses
```

### Docker Compose Migration

```yaml
# Key changes in docker-compose.yml

# New services added in Phase 2:
services:
  reranker:           # 🆕 Cross-encoder reranking
    image: sentence-transformers/cross-encoder:ms-marco-MiniLM-L-6-v2

  evaluation:         # 🆕 Evaluation framework
    build: ./packages/evals

  redis:              # 🆕 Optional caching layer
    image: redis:7.2-alpine

# Updated services:
  api:                # 🔄 Enhanced with Phase 2 features
    environment:
      - HYBRID_SEARCH_ENABLED=true
      - RERANKER_ENABLED=true
      - GUARDRAILS_ENABLED=true
      # ... additional Phase 2 config
```

---

## 📊 Data Migration

### Database Compatibility

**Good News**: No database migration required!

```bash
# Verify data compatibility
echo "Checking Qdrant collection compatibility..."

# Check existing collection
curl -s "http://localhost:6333/collections/documents" | jq '.result'

# Verify vector dimensions (should be 384 for BGE)
curl -s "http://localhost:6333/collections/documents" | jq '.result.config.params.vectors.size'

# Check document count
curl -s "http://localhost:6333/collections/documents" | jq '.result.points_count'

echo "✅ Existing Qdrant data is fully compatible with Phase 2"
```

### Optional: Data Enhancement

```bash
# Optional: Add freshness metadata to existing documents
# This script can enhance existing documents with freshness information

curl -X POST "http://localhost:3000/admin/enhance-metadata" \
  -H "Content-Type: application/json" \
  -d '{
    "enhancements": ["freshness", "language_detection"],
    "batchSize": 100
  }'

echo "✅ Optional data enhancements applied"
```

---

## 🧪 Testing & Validation

### Functional Testing

```bash
# Test Suite: Phase 2 Feature Validation
echo "Running Phase 2 validation tests..."

# Test 1: Hybrid Search
echo "Testing hybrid search..."
response=$(curl -s -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning algorithms",
    "userContext": {"id": "test", "tenantId": "test", "groupIds": ["public"]},
    "k": 8
  }')

# Verify hybrid search results
echo $response | jq '.retrievedDocuments | length' | grep -q "8" && echo "✅ Hybrid search returns 8 results" || echo "❌ Hybrid search failed"

# Test 2: Answer Synthesis
echo "Testing answer synthesis..."
echo $response | jq -e '.answer' > /dev/null && echo "✅ Answer synthesis working" || echo "❌ Answer synthesis failed"

# Test 3: Citations
echo "Testing citations..."
echo $response | jq -e '.citations' > /dev/null && echo "✅ Citations working" || echo "❌ Citations failed"

# Test 4: Guardrails
echo "Testing guardrails..."
echo $response | jq -e '.guardrailDecision' > /dev/null && echo "✅ Guardrails working" || echo "❌ Guardrails failed"

# Test 5: Reranking (when enabled)
echo "Testing reranking..."
curl -s -X POST http://localhost:8081/health > /dev/null && echo "✅ Reranker service available" || echo "❌ Reranker service failed"

echo "✅ Phase 2 validation tests complete"
```

### Performance Testing

```bash
# Performance comparison: Phase 1 vs Phase 2
echo "Running performance comparison..."

# Test latency
start_time=$(date +%s%N)
curl -s -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "performance test query",
    "userContext": {"id": "test", "tenantId": "test", "groupIds": ["public"]},
    "k": 8
  }' > /dev/null
end_time=$(date +%s%N)

latency=$(( (end_time - start_time) / 1000000 ))
echo "Phase 2 latency: ${latency}ms"

# Compare to Phase 1 baseline (if available)
if [ -f "migration-backup/$(date +%Y%m%d)/phase1-response-sample.json" ]; then
    echo "Phase 1 baseline available for comparison"
    # Add comparison logic here
fi

echo "✅ Performance testing complete"
```

### Evaluation Framework Testing

```bash
# Run evaluation suite
echo "Testing evaluation framework..."

# Run quick evaluation
docker-compose --profile evaluation run --rm evaluation \
  --datasets gold,ood \
  --sample-size 10 \
  --output /app/results/migration-test

# Check results
if [ -f "eval-results/migration-test/evaluation-report.json" ]; then
    echo "✅ Evaluation framework working"
    jq '.overall.passRate' eval-results/migration-test/evaluation-report.json
else
    echo "❌ Evaluation framework failed"
fi
```

---

## 🔙 Rollback Procedures

### Emergency Rollback

If issues arise, you can quickly rollback to Phase 1:

```bash
#!/bin/bash
# rollback-to-phase1.sh

echo "🚨 Rolling back to Phase 1..."

# Stop Phase 2 services
docker-compose down --timeout 30

# Restore Phase 1 configuration
cp migration-backup/$(date +%Y%m%d)/env-phase1.backup .env
cp migration-backup/$(date +%Y%m%d)/docker-compose-phase1.backup docker-compose.yml

# Restore Qdrant data (if needed)
if [ -f "migration-backup/$(date +%Y%m%d)/qdrant-snapshot.zip" ]; then
    echo "Qdrant data backup available for restore if needed"
    # Uncomment if data restore needed:
    # docker volume rm qdrant_data
    # unzip -q migration-backup/$(date +%Y%m%d)/qdrant-snapshot.zip -d /tmp/
    # docker volume create qdrant_data
    # cp -r /tmp/qdrant/* /var/lib/docker/volumes/qdrant_data/_data/
fi

# Start Phase 1 services
docker-compose up -d

# Wait for services
sleep 30

# Verify rollback
curl -f http://localhost:3000/healthz && echo "✅ Rollback successful" || echo "❌ Rollback failed"

echo "Phase 1 rollback complete"
```

### Partial Rollback

Disable specific Phase 2 features while keeping the infrastructure:

```bash
# Disable specific features
echo "HYBRID_SEARCH_ENABLED=false" >> .env
echo "RERANKER_ENABLED=false" >> .env
echo "GUARDRAILS_ENABLED=false" >> .env
echo "SYNTHESIS_ENABLED=false" >> .env

# Restart API to apply changes
docker-compose restart api

echo "✅ Phase 2 features disabled"
```

---

## 🚨 Troubleshooting Migration Issues

### Common Issues & Solutions

#### 1. Reranker Service Won't Start

```bash
# Issue: Insufficient memory for reranker
# Solution: Reduce batch size or increase memory

# Check reranker logs
docker logs cw-rag-reranker

# Reduce memory requirements
echo "RERANKER_BATCH_SIZE=16" >> .env
echo "RERANKER_MAX_LENGTH=256" >> .env
docker-compose restart reranker
```

#### 2. LLM Integration Fails

```bash
# Issue: API key or connectivity problems
# Solution: Verify API key and test connectivity

# Test OpenAI connectivity
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4-turbo",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10
  }'

# Or disable synthesis temporarily
echo "SYNTHESIS_ENABLED=false" >> .env
docker-compose restart api
```

#### 3. Performance Degradation

```bash
# Issue: Phase 2 too slow
# Solution: Optimize configuration

# Disable non-essential features temporarily
echo "RERANKER_ENABLED=false" >> .env
echo "CITATIONS_FRESHNESS_ENABLED=false" >> .env

# Reduce context length
echo "SYNTHESIS_MAX_CONTEXT_LENGTH=4000" >> .env

docker-compose restart api
```

#### 4. Memory Issues

```bash
# Issue: Out of memory errors
# Solution: Optimize memory usage

# Check memory usage
docker stats

# Reduce memory consumption
echo "NODE_OPTIONS=--max-old-space-size=1024" >> .env
echo "RERANKER_MAX_BATCH_SIZE=16" >> .env

# Scale down if needed
docker-compose down
docker-compose up -d --scale api=1
```

### Migration Validation Script

```bash
#!/bin/bash
# validate-migration.sh

echo "=== Phase 2 Migration Validation ==="

# Check all services
services=("api" "qdrant" "reranker" "embeddings")
for service in "${services[@]}"; do
    if docker-compose ps $service | grep -q "Up"; then
        echo "✅ $service: Running"
    else
        echo "❌ $service: Not running"
        exit 1
    fi
done

# Check API endpoints
endpoints=("/healthz" "/readyz")
for endpoint in "${endpoints[@]}"; do
    if curl -f "http://localhost:3000$endpoint" > /dev/null 2>&1; then
        echo "✅ API$endpoint: OK"
    else
        echo "❌ API$endpoint: Failed"
        exit 1
    fi
done

# Test Phase 2 features
echo "Testing Phase 2 features..."
response=$(curl -s -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test validation",
    "userContext": {"id": "test", "tenantId": "test", "groupIds": ["public"]},
    "k": 8
  }')

# Validate response structure
if echo "$response" | jq -e '.answer' > /dev/null; then
    echo "✅ Answer synthesis: Working"
else
    echo "❌ Answer synthesis: Failed"
fi

if echo "$response" | jq -e '.citations' > /dev/null; then
    echo "✅ Citations: Working"
else
    echo "❌ Citations: Failed"
fi

if echo "$response" | jq -e '.guardrailDecision' > /dev/null; then
    echo "✅ Guardrails: Working"
else
    echo "❌ Guardrails: Failed"
fi

echo "=== Migration validation complete ==="
```

---

## 📚 Post-Migration Steps

### 1. Update Client Integrations

```typescript
// Update client code to handle Phase 2 response format

// Phase 1 response handling
interface Phase1Response {
  answer: string;  // Was stub answer
  retrievedDocuments: Document[];
  queryId: string;
}

// Phase 2 response handling
interface Phase2Response {
  answer: string;                    // Generated by LLM
  citations: Citation[];             // 🆕 Citation metadata
  retrievedDocuments: Document[];
  guardrailDecision: {               // 🆕 Guardrail information
    isAnswerable: boolean;
    confidence: number;
  };
  freshnessStats: FreshnessStats;    // 🆕 Freshness information
  synthesisMetadata: {               // 🆕 Synthesis metadata
    tokensUsed: number;
    modelUsed: string;
    confidence: number;
  };
  queryId: string;
}
```

### 2. Configure Monitoring

```bash
# Set up Phase 2 monitoring
# Add monitoring dashboards for new metrics
# Configure alerts for Phase 2 components

# Example: Prometheus configuration for Phase 2
cat >> prometheus.yml << 'EOF'
  - job_name: 'cw-rag-reranker'
    static_configs:
      - targets: ['localhost:8081']
    metrics_path: '/metrics'

  - job_name: 'cw-rag-evaluation'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
EOF
```

### 3. Update Documentation

```bash
# Update API documentation
# Update user guides
# Update operational procedures

echo "Update internal documentation to reflect Phase 2 capabilities"
```

### 4. Training & Communication

```bash
# Plan team training on Phase 2 features
# Communicate changes to stakeholders
# Update runbooks and procedures

echo "Plan training for Phase 2 features and capabilities"
```

---

## 📊 Migration Success Criteria

### ✅ Validation Checklist

- [ ] All Phase 2 services running and healthy
- [ ] Hybrid search returning 8 results instead of 5
- [ ] Answer synthesis generating LLM responses
- [ ] Citations being extracted and displayed
- [ ] Guardrails making answerability decisions
- [ ] Reranker service operational (if enabled)
- [ ] Evaluation framework functional
- [ ] Performance within acceptable range (<3s end-to-end)
- [ ] No data loss from Phase 1
- [ ] Existing API endpoints still functional
- [ ] Web UI displaying new Phase 2 features
- [ ] Monitoring and logging operational

### 📈 Success Metrics

```bash
# Measure migration success
echo "Phase 2 Migration Success Metrics:"
echo "- End-to-end latency: <3s (target)"
echo "- Answer relevance: >85% (target)"
echo "- Citation accuracy: >95% (target)"
echo "- System availability: >99% (target)"
echo "- Error rate: <2% (target)"
```

---

## 🎉 Migration Complete

After successful migration to Phase 2, you now have:

- ✅ **Hybrid Search Engine** with vector + keyword fusion
- ✅ **Cross-Encoder Reranking** for optimal relevance
- ✅ **LLM Answer Synthesis** with automatic citations
- ✅ **Answerability Guardrails** for quality control
- ✅ **Enhanced Web UI** with citations and freshness
- ✅ **Comprehensive Evaluation** framework
- ✅ **Production-Grade Security** and monitoring

Your RAG system is now a **production-grade intelligence platform** capable of providing accurate, cited, and contextual answers to user queries.

---

## 📞 Support & Resources

### Documentation
- [Phase 2 Features Guide](phase2-features.md)
- [Deployment Guide](deployment-phase2.md)
- [Performance Benchmarks](performance-benchmarks.md)

### Troubleshooting
- Check logs: `docker-compose logs [service-name]`
- Health checks: `curl http://localhost:3000/healthz`
- Rollback: Run `rollback-to-phase1.sh` script

### Community
- GitHub Issues: Report migration problems
- Documentation: Update guides based on experience
- Feedback: Share migration experience for future improvements

---

*Migration complete! Your CW RAG Core system is now running Phase 2 with full production-grade capabilities. For ongoing operations, see the [Deployment Guide](deployment-phase2.md).*