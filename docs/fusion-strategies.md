# Fusion Strategies Documentation

## Overview

The RAG system now supports multiple fusion strategies for combining vector and keyword search results. This replaces the previous rank-only RRF approach that caused 97-99% score degradation.

## Problem with Old RRF

The original Reciprocal Rank Fusion used: `weight × (1/(rank + k))`

With k=60, this caused catastrophic score collapse:
- Isharoth (rank 18, score 0.617) → fused score 0.012 (99.1% loss)
- Chrono Distortion (rank 1, score 0.761) → fused score 0.164 (97.3% loss)

## New Fusion Strategies

### 1. weighted_average (Default)

**Formula**: `fused = vWeight × vNorm + kWeight × kNorm`

**Features**:
- Preserves semantic scores from both sources
- Min-max normalizes each result list to [0,1]
- Handles missing results gracefully (uses available source fully)
- No rank-based degradation

**Use Case**: General queries where both semantic and lexical matching matter

### 2. score_weighted_rrf

**Formula**: `fused = vWeight × (vNorm × vRankScore) + kWeight × (kNorm × kRankScore)`
**Where**: `rankScore = 1/(rank + kParam)`

**Features**:
- Preserves score information while adding mild rank smoothing
- Configurable kParam (default: 5, much smaller than old k=60)
- Balances semantic confidence with positional relevance

**Use Case**: When rank matters but shouldn't dominate scores

### 3. max_confidence

**Formula**: `fused = max(vNorm, kNorm)`

**Features**:
- Takes the highest confidence from either source
- Tie-breaking on raw normalized scores
- Safety fallback for high-stakes queries

**Use Case**: High-confidence queries (automatically selected for top vector scores ≥0.80)

### 4. borda_rank (Legacy Compatibility)

**Formula**: `fused = vWeight × (1/(rank + k)) + kWeight × (1/(rank + k))`

**Features**:
- Original rank-only RRF (now with configurable k)
- For debugging and backward compatibility
- Mathematically equivalent to old system

**Use Case**: Debugging or gradual rollout scenarios

## Configuration

Environment variables:

```bash
# Strategy selection (auto-adaptive for high confidence)
FUSION_STRATEGY=weighted_average  # weighted_average | score_weighted_rrf | max_confidence | borda_rank

# Parameters (optimized for score preservation)
FUSION_NORMALIZATION=none         # none | minmax | zscore (none preserves raw scores best)
FUSION_K_PARAM=1                  # Minimal RRF parameter (was 60, now 1)

# Weights (can be overridden per query)
HYBRID_VECTOR_WEIGHT=0.7
HYBRID_KEYWORD_WEIGHT=0.3

# Features
QUERY_ADAPTIVE_WEIGHTS=on        # on|off - Intent-based weight adaptation
FUSION_DEBUG_TRACE=on            # on|off - Include fusion telemetry in responses
```

## Query-Adaptive Weighting

Based on detected query intent:

| Intent | Vector Weight | Keyword Weight | Strategy |
|--------|---------------|----------------|----------|
| Definition/Measurement/Procedure | 0.5 | 0.5 | weighted_average |
| Entity Lookup | 0.7 | 0.3 | weighted_average |
| Exploratory | 0.7 | 0.3 | weighted_average |

**High-Confidence Shortcut**: If top vector score ≥0.70 and intent ∈ {definition, measurement, exact-lookup}, automatically switches to `max_confidence` strategy.

**Auto Max-Confidence**: For any query with top vector score ≥0.75, automatically switches to `max_confidence` strategy regardless of intent (preserves semantic confidence).

## Score Normalization

### Min-Max Normalization (Default)
```
normalized = (score - min) / (max - min)
```
- Scales to [0,1]
- Preserves relative differences
- Handles constant scores (returns 0.5)

### Z-Score Normalization
```
normalized = (score - mean) / std_dev
```
- Centers around 0
- Handles outliers better
- May produce negative values

### None
- Uses raw scores as-is
- Fastest but may cause issues with different scales

## Telemetry

When `FUSION_DEBUG_TRACE=on`, responses include:

```json
{
  "fusion": {
    "strategy": "weighted_average",
    "normalization": "minmax",
    "vectorWeight": 0.7,
    "keywordWeight": 0.3,
    "kParam": 5,
    "vectorTop": [
      {"id": "doc1", "score": 0.85, "rank": 1}
    ],
    "keywordTop": [
      {"id": "doc1", "score": 0.72, "rank": 2}
    ],
    "fused": [
      {
        "id": "doc1",
        "fusedScore": 0.82,
        "components": {
          "vector": 1.0,
          "keyword": 0.67
        }
      }
    ]
  }
}
```

## Migration Guide

### From Old RRF (k=60)
1. Set `FUSION_STRATEGY=weighted_average`
2. Set `FUSION_K_PARAM=5`
3. Monitor fusion scores (should be >0.02 for top candidates)
4. Verify probe queries still work

### Rollback
If issues occur, set `FUSION_STRATEGY=borda_rank` to restore old behavior.

## Performance Impact

- **weighted_average**: Minimal overhead (just normalization)
- **score_weighted_rrf**: Small overhead (rank calculations)
- **max_confidence**: Minimal overhead
- **borda_rank**: Same as old system

All strategies maintain O(n log n) sorting complexity.

## Testing

Run the eval script:
```bash
cd packages/retrieval-eval
node test-probe-queries.js
```

Expected results:
- Isharoth case: fused score >0.1 (vs 0.012 with old RRF)
- Chrono Distortion: remains rank 1
- No scores <0.02 for top-3 candidates