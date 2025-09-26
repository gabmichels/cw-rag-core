# Retrieval Architecture

## Overview

The RAG retrieval system combines multiple search strategies to provide accurate, contextually relevant results. The system has been updated to use pluggable fusion strategies that preserve semantic confidence scores.

## Components

### 1. Vector Search
- **Purpose**: Semantic similarity matching
- **Implementation**: Qdrant vector database
- **Features**: Cosine similarity, pre-filtering, metadata filtering

### 2. Keyword Search
- **Purpose**: Lexical/exact matching
- **Implementation**: Qdrant full-text search
- **Features**: BM25 scoring, section-aware results

### 3. Fusion Strategies
- **Purpose**: Combine vector and keyword results
- **Implementation**: Pluggable strategy system
- **Available Strategies**:
  - `weighted_average` (default): Preserves semantic scores
  - `score_weighted_rrf`: Balances scores and ranks
  - `max_confidence`: Safety fallback for high-confidence queries
  - `borda_rank`: Legacy rank-only RRF

### 4. Query Intent Detection
- **Purpose**: Adapt retrieval strategy based on query type
- **Intents**:
  - Definition/Measurement/Procedure: Balanced weights (0.5/0.5)
  - Entity Lookup: Vector-heavy (0.7/0.3)
  - Exploratory: Vector-heavy (0.7/0.3)
- **High-Confidence Shortcut**: Auto-switches to `max_confidence` for top scores ≥0.80

### 5. Section Reconstruction
- **Purpose**: Reassemble document sections from chunks
- **Trigger**: When query matches section headers
- **Benefits**: Provides complete context for complex answers

### 6. Context Packing
- **Purpose**: Fit relevant content within LLM token limits
- **Strategies**: Token budgeting, novelty scoring, answerability bonuses

## Fusion Strategy Details

### Problem Solved
Previous rank-only RRF with k=60 caused 97-99% score degradation:
- Vector score 0.76 → RRF score 0.016 (97.9% loss)
- Vector score 0.62 → RRF score 0.012 (99.1% loss)

### New Approach
```typescript
// weighted_average strategy (default)
fused = vectorWeight * vectorNorm + keywordWeight * keywordNorm

// With min-max normalization to [0,1]
// Preserves relative semantic confidence
```

### Configuration
```bash
FUSION_STRATEGY=weighted_average
FUSION_NORMALIZATION=minmax
FUSION_K_PARAM=5  # Much smaller than old k=60
HYBRID_VECTOR_WEIGHT=0.7
HYBRID_KEYWORD_WEIGHT=0.3
```

## Data Flow

```
Query → Intent Detection → Adaptive Weights → Parallel Search → Fusion → Reranking → Context Packing → Answer Synthesis
    ↓         ↓                    ↓              ↓         ↓        ↓          ↓              ↓
  User     Strategy             Vector        Combine   Optional   Fit in     Generate
 Input    Selection           + Keyword      Results    Reorder   Token Budget Response
```

## Performance Characteristics

- **Latency**: 3.7-58s (varies with section reconstruction)
- **Accuracy**: 74-76% for vector search, improved fusion preservation
- **Scalability**: O(n log n) for fusion, linear for search
- **Memory**: Minimal overhead for new fusion strategies

## Monitoring & Telemetry

### Fusion Debug Trace
When `FUSION_DEBUG_TRACE=on`, includes detailed fusion information:
```json
{
  "fusion": {
    "strategy": "weighted_average",
    "vectorTop": [{"id": "doc1", "score": 0.85, "rank": 1}],
    "keywordTop": [{"id": "doc1", "score": 0.72, "rank": 2}],
    "fused": [{"id": "doc1", "fusedScore": 0.82, "components": {"vector": 1.0, "keyword": 0.67}}]
  }
}
```

### Key Metrics
- Fusion duration
- Result counts by source
- Score distributions
- Strategy effectiveness

## Migration & Rollback

### Safe Rollout
1. Default to `weighted_average` strategy
2. Monitor fusion scores (>0.02 for top candidates)
3. Verify probe queries (Isharoth, Chrono Distortion)
4. Gradual rollout with feature flags

### Rollback Plan
Set `FUSION_STRATEGY=borda_rank` to restore old RRF behavior.

## Testing

### Unit Tests
- Fusion strategy correctness
- Score normalization edge cases
- Intent mapping validation

### Integration Tests
- End-to-end query evaluation
- Performance regression checks
- Accuracy validation with gold standard queries

### Probe Queries
- **Isharoth**: "How long is a day in Isharoth?" → Should return "31 hours"
- **Chrono Distortion**: "What is the Ultimate of the Wizard?" → Should return complete spell details

## Future Improvements

1. **Adaptive K-Parameter**: Dynamic k based on result distribution
2. **Query-Specific Strategies**: ML-based strategy selection
3. **Multi-Modal Fusion**: Beyond text vector + keyword
4. **Real-time Learning**: Continuous strategy optimization