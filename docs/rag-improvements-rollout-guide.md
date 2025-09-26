# RAG Improvements Rollout Guide

## Overview

This guide outlines the safe rollout of enhanced RAG retrieval and context building features. The improvements address known failure modes like keyword crowd-out and answer chunk separation.

## Features Being Rolled Out

### 1. Query-Adaptive Weighting
- **What**: Automatically adjusts vector vs keyword search weights based on query intent
- **Config**: `QUERY_ADAPTIVE_WEIGHTS=on`
- **Impact**: Better retrieval for entity-heavy queries

### 2. Increased Retrieval K
- **What**: Retrieves more candidates before fusion (12-16 vs 5-10)
- **Config**: `RETRIEVAL_K_BASE=12`
- **Impact**: More diverse candidates, better MMR performance

### 3. MMR Reranking
- **What**: Maximally Marginal Relevance to reduce redundancy
- **Config**: `MMR_ENABLED=on`
- **Impact**: Less repetitive context, better answer quality

### 4. Deduplication
- **What**: Removes duplicate chunks by docId before fusion
- **Config**: `DEDUPLICATION_ENABLED=on` (default)
- **Impact**: Cleaner context, no wasted budget

### 5. Context Packing
- **What**: Smart token budgeting with answerability guard
- **Config**: `CONTEXT_PACKING_ENABLED=on` (default)
- **Impact**: Better context utilization, fewer IDK responses

### 6. Chunking Hygiene
- **What**: Overlap preservation, validation, ingestion guard
- **Config**: `INGESTION_GUARD_ENABLED=on` (default)
- **Impact**: Higher quality chunks, fewer ingestion errors

### 7. Qdrant Optimizations
- **What**: Adaptive EF, caching, optimized HNSW config
- **Config**: `ADAPTIVE_EF_ENABLED=on` (default)
- **Impact**: Faster searches, better recall

## Rollout Strategy

### Phase 1: Feature Flags & Monitoring (Week 1-2)
```bash
# Enable basic improvements with monitoring
export QUERY_ADAPTIVE_WEIGHTS=on
export MMR_ENABLED=on
export RETRIEVAL_K_BASE=12
export TELEMETRY_ENABLED=on

# Keep safety features on (defaults)
export DEDUPLICATION_ENABLED=on
export CONTEXT_PACKING_ENABLED=on
export INGESTION_GUARD_ENABLED=on
```

**Success Criteria**:
- No increase in error rates (>5%)
- Latency increase <50ms average
- Isharoth query passes (was failing)

### Phase 2: Full Enablement (Week 3-4)
```bash
# Enable all optimizations
export ADAPTIVE_EF_ENABLED=on
export CACHING_ENABLED=on
export SECTION_REUNIFICATION_ENABLED=on
```

**Success Criteria**:
- 10%+ improvement in answer quality metrics
- Latency acceptable (<200ms p95)
- All probe queries working

### Phase 3: Production Stabilization (Week 5-6)
- Monitor for 1 week
- A/B test with 10% traffic if needed
- Full rollout if metrics good

## Monitoring & Metrics

### Key Metrics to Track
- **Answer Quality**: % questions answered (vs IDK)
- **Latency**: p50/p95/p99 response times
- **Error Rate**: 5xx errors, timeouts
- **Token Efficiency**: Context utilization ratio
- **Retrieval Quality**: Precision@5, NDCG@10

### Telemetry Events
```typescript
// Track feature usage
telemetry.recordFeatureUsage('adaptive_weighting', tenantId, {
  queryIntent: 'entity_lookup',
  weights: { vector: 0.6, keyword: 0.4 }
});

// Monitor performance
telemetry.recordSearch(queryId, tenantId, duration, success, {
  features: ['mmr', 'dedupe'],
  retrievedCount: 12,
  finalCount: 8
});
```

### Dashboards
- Grafana dashboard for latency/error trends
- Custom metrics for answer quality
- Feature usage breakdown by tenant

## Rollback Plan

### Immediate Rollback (Feature Flags)
```bash
# Disable all new features
export QUERY_ADAPTIVE_WEIGHTS=off
export MMR_ENABLED=off
export RETRIEVAL_K_BASE=5  # Back to original
export ADAPTIVE_EF_ENABLED=off
export CACHING_ENABLED=off
```

### Code Rollback
- Git revert to pre-improvement commit
- Rebuild and redeploy
- Monitor recovery

## Testing

### Pre-Rollout Testing
```bash
# Run evaluation harness
cd packages/retrieval-eval
npm run eval -- --test-name prerollout

# Check Isharoth specifically
npm run eval -- --query "How long is a Day in Isharoth?" --check-answerable
```

### Post-Rollout Validation
- Automated probe query tests
- A/B test with 1% traffic initially
- Gradual ramp-up based on metrics

## Configuration Reference

### Environment Variables
```bash
# Core features
QUERY_ADAPTIVE_WEIGHTS=on|off
MMR_ENABLED=on|off
DEDUPLICATION_ENABLED=on|off
CONTEXT_PACKING_ENABLED=on|off

# Performance
RETRIEVAL_K_BASE=12
ADAPTIVE_EF_ENABLED=on|off
CACHING_ENABLED=on|off

# Quality thresholds
MIN_QUALITY_SCORE=0.5
MAX_CONTEXT_TOKENS=8000

# Chunking
INGESTION_GUARD_ENABLED=on|off
CHUNK_OVERLAP_ENABLED=on|off
SECTION_REUNIFICATION_ENABLED=on|off

# Telemetry
TELEMETRY_ENABLED=on|off
```

### Feature Interactions
- **Adaptive weighting** works with **MMR** for best results
- **Deduplication** reduces **retrieval K** effectiveness if too aggressive
- **Context packing** depends on **answerability guard** for quality

## Troubleshooting

### Common Issues

**High Latency**:
- Check `RETRIEVAL_K_BASE` - reduce if > 16
- Disable `ADAPTIVE_EF_ENABLED` if CPU bound
- Monitor Qdrant performance

**Poor Answer Quality**:
- Verify `QUERY_ADAPTIVE_WEIGHTS=on`
- Check `MMR_ENABLED` isn't over-filtering
- Review deduplication logic

**Chunking Errors**:
- Check `INGESTION_GUARD_ENABLED` logs
- Validate chunk quality scores
- Monitor rejected chunk rates

### Debug Commands
```bash
# Check feature flags
curl http://api:3000/debug/config

# View telemetry
curl http://api:3000/debug/telemetry

# Test specific query
curl -X POST http://api:3000/ask \
  -d '{"query":"How long is a Day in Isharoth?","userContext":{"id":"test","groupIds":[],"tenantId":"test"}}'
```

## Success Criteria

### Functional
- ✅ Isharoth query returns correct answer
- ✅ All 8 probe queries work
- ✅ No regression in existing functionality

### Performance
- ✅ Latency < 200ms p95
- ✅ Error rate < 1%
- ✅ Context utilization > 80%

### Quality
- ✅ Answer rate > 85% (vs current ~70%)
- ✅ User satisfaction scores maintained/improved
- ✅ Precision@5 > 0.75

## Support

- **Owner**: RAG Team
- **Monitoring**: #rag-alerts Slack channel
- **Docs**: This guide + inline code comments
- **Runbooks**: `RUNBOOK-retrieval.md`, `RUNBOOK-ingestion.md`