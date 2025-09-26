# RAG Retrieval & Context Builder Improvements: Design Document

## Executive Summary

This document outlines the design for making our RAG system world-class by addressing the core issues identified in the audit: token-true budgeting, query-adaptive retrieval, redundancy control, section cohesion, and observability. The improvements focus on ensuring answer-bearing chunks reliably win context budget while maintaining performance.

## Problem Statement

From the audit, key issues include:
- Char-based token estimation causing truncation errors
- Fixed hybrid weights leading to keyword crowd-out
- No deduplication or novelty control
- Header/answer splits from chunking
- Lack of observability for debugging retrieval issues

## Solution Overview

### A) Context Packing (Highest ROI)

**Token-True Budgeting**
- Replace char/4 heuristic with actual tokenizer (GPT-4o compatible)
- Config: `CONTEXT_TOKEN_BUDGET=8000`, `TOKENIZER_MODEL=gpt-4o-2024-11-20`

**Inclusion Policy**
- Sort by FinalScore (fusion/rerank score)
- Apply caps: per-doc (2), per-section (1 unless answer spans)
- Novelty/MMR with cosine similarity (α=0.5) to reduce duplicates
- Answerability boost: lightweight feature scoring (+0.05-0.15 to FinalScore)
- Section reunification: attach header + neighbors if budget allows

**Truncation Policy**
- Remove lowest-marginal-value items first (low score + high redundancy)
- Never blindly cut last item

**Observability**
- JSON packing trace: selected IDs, tokens, scores, decisions, drop reasons

### B) Retrieval Upgrades

**Increased Candidate Pool**
- Pre-fusion k=12-16 (config: `RETRIEVAL_K_BASE=12`)

**Query-Adaptive Weighting**
- Intent detection: definition/measurement/procedure vs. exploratory
- Presets: definition (0.5/0.5, k=16), exploratory (0.7/0.3, k=12)
- Config: `QUERY_ADAPTIVE_WEIGHTS=on`

**Diversity & Deduplication**
- MMR (α=0.5) or cross-encoder rerank of top 50 → top 12
- Dedupe by URL/docId/offset before fusion
- Config: `MMR_ALPHA=0.5`, `RERANKER=crossencoder`

### C) Chunking Hygiene

**Overlap & Headers**
- 10-15% overlap to reduce splits
- Carry-forward headers in metadata

**Payload Verification**
- Ensure: sectionPath, orderIndex, header, docTitle, embedderVersion

**Ingestion Guard**
- Reject mixed embedderVersion unless flagged

### D) Qdrant & Performance

**Config Optimization**
- Cosine distance, HNSW tuning
- Payload indexing on tenant, spaceId, acl, lang

**Caching**
- Short TTL cache on query + filters

## Trade-offs & Decisions

### Token Budgeting
- **Decision**: Use tiktoken for accuracy over speed
- **Trade-off**: ~10% latency increase for 95%+ accuracy
- **Mitigation**: Cache token counts, batch operations

### Query-Adaptive Weights
- **Decision**: Rule-based intent detection (fast) over ML
- **Trade-off**: Less sophisticated but zero latency impact
- **Mitigation**: Easy to upgrade to ML later

### MMR vs Rerank
- **Decision**: Prefer cross-encoder rerank for quality
- **Trade-off**: Higher latency vs vector MMR
- **Mitigation**: Configurable fallback to MMR

### Feature Flags
- All new behavior behind flags with backward compatibility
- Gradual rollout: packing first, then retrieval, then eval

## Configuration & Flags

```bash
# Context Packing
CONTEXT_TOKEN_BUDGET=8000
TOKENIZER_MODEL=gpt-4o-2024-11-20
PACKING_PER_DOC_CAP=2
PACKING_PER_SECTION_CAP=1
PACKING_NOVELTY_ALPHA=0.5
PACKING_ANSWERABILITY_BONUS=0.1
SECTION_REUNIFICATION=on

# Retrieval
RETRIEVAL_K_BASE=12
HYBRID_VECTOR_WEIGHT=0.7
HYBRID_KEYWORD_WEIGHT=0.3
QUERY_ADAPTIVE_WEIGHTS=on
MMR_ALPHA=0.5
RERANK_TOPK=12
RERANKER=crossencoder

# Observability
RETRIEVAL_TRACE=0
```

## Success Criteria

- **Answer Recall@Budget**: +10-20pp on goldens
- **Isharoth Query**: ≥95% answer chunk inclusion
- **Garbage Fraction**: -30%
- **Redundancy Ratio**: ≤1.2
- **Latency**: P95 within +15% of baseline

## Implementation Plan

1. **Phase 1**: Context packing module (token budgeter, inclusion policy)
2. **Phase 2**: Retrieval upgrades (adaptive weights, MMR)
3. **Phase 3**: Chunking & Qdrant optimizations
4. **Phase 4**: Eval harness & telemetry
5. **Phase 5**: A/B testing & rollout

## Rollout Strategy

- Feature flags enable gradual deployment
- A/B testing on 10% traffic first
- Monitor metrics for regressions
- Rollback plan: disable flags if issues detected

## A/B Testing Plan

### Test Design
- **Traffic Split**: 50/50 baseline vs. improved
- **Duration**: 2 weeks minimum
- **Sample Size**: 10k queries per variant
- **Metrics**:
  - Answer Recall@Budget (primary)
  - Garbage Fraction
  - Redundancy Ratio
  - P95 Latency
  - User satisfaction (if available)

### Variants
- **Baseline**: Current system (char-based budgeting, fixed weights)
- **Improved**: New token budgeting, adaptive weights, MMR, packing policy

### Success Criteria
- Statistical significance (p < 0.05) on Answer Recall improvement
- No regression on latency (>5% increase requires review)
- Garbage Fraction reduction >2pp

### Rollback Triggers
- Answer Recall drops >5pp
- Latency increases >20%
- Error rate increases >1pp

## Risk Mitigation

- Comprehensive tests for each component
- Eval harness prevents regressions
- Telemetry for debugging
- Backward compatibility maintained