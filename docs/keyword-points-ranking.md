# Keyword Points Ranking

## Overview

The Keyword Points Ranker is a domain-agnostic, deterministic ranking system that operates after fusion/rerank and before packing. It prioritizes body content (where answers live) while using title/header/section/docId as secondary signals. The ranker is designed to improve retrieval quality by scoring candidates based on keyword importance, field relevance, and positional/proximity bonuses.

## Rationale

Traditional keyword scoring often treats all fields equally or over-weights metadata. However, in RAG systems, the actual answer content resides in the document body. The Keyword Points Ranker addresses this by:

- **Body-first weighting**: Prioritizing body matches over title/header matches
- **Saturation modeling**: Preventing spam-like repetition from dominating scores
- **Proximity awareness**: Boosting candidates where key terms appear close together
- **Early position preference**: Favoring candidates where key terms appear early in the content
- **Coverage incentives**: Rewarding candidates that contain all important query terms

## Core Algorithm

### Term Importance & Ranking

For each query term/phrase `t`:

```
w(t) = base * IDF(t)^γ * phrase_bonus
```

Where:
- `base = 1.0`
- `γ = 0.35` (IDF gamma)
- `phrase_bonus = 1.25` if multi-word phrase

Terms are ordered by `w(t)`, with rank 1 being most important.

**Rank decay**: `rank_decay(r) = δ^(r-1)` with `δ = 0.85`

### Per-Candidate Keyword Points

#### Field Weights (Body-First)

```typescript
fieldWeights = {
  body: 3.0,      // Highest priority - answer content
  title: 2.2,     // Important for relevance
  header: 1.8,    // Section context
  sectionPath: 1.3, // Document structure
  docId: 1.1      // Lowest priority
}
```

#### Match Strength

- `exact phrase = 1.0`
- `lemma/token = 0.7`
- `fuzzy (ed<=1) = 0.4`

#### Body Saturation

Prevents over-weighting of repetitive content:

```
sat(hits) = 1 - exp(-C * hits)
body_term_points = BODY_W * match_strength * sat(hits)
```

With `C = 0.6` providing reasonable saturation.

#### Per-Term Points

```
term_points(t) = w(t) * rank_decay(rank(t)) *
                 max_over_fields(FIELD_WEIGHT[f] * match_strength(t,f)) *
                 position_nudge(f, pos)
```

### Position & Proximity Bonuses

#### Early Position Nudge

If the first matched keyphrase appears within the first `N = 250` body tokens:

```
term_points *= EARLY_POS_NUDGE (default 1.08)
```

#### Proximity Bonus

For top 2-3 ranked terms, compute min token span covering them:

```
proximity_bonus = 1 + β * (1 - span/PROX_WIN)
```

Clamped to `[1, 1+β]` with `β = 0.25` and `PROX_WIN = 30`.

### Coverage & Exclusivity

#### Coverage Bonus

If all top `K = 2` keyphrases appear anywhere:

```
final_score *= (1 + α) with α = 0.25
```

#### Soft Exclusivity Penalty

If a near-exclusive rival term appears and at least one top keyphrase is missing:

```
final_score *= (1 - γ) with γ = 0.25
```

### Normalization & Blend

#### Per-Query Normalization

```
kw_norm = raw_kw / (median_raw_kw_across_candidates + ε)
```

#### Additive Blend

```
finalScore = fusedScore + λ * kw_norm
```

With `λ = 0.25` and `kw_norm ≤ 2.0` to prevent runaway effects.

## Configuration Flags

| Flag | Default | Description |
|------|---------|-------------|
| `KW_POINTS_ENABLED` | `on` | Enable/disable the ranker |
| `KW_LAMBDA` | `0.25` | Blend weight for keyword points |
| `KW_IDF_GAMMA` | `0.35` | IDF exponent for term weighting |
| `KW_RANK_DECAY` | `0.85` | Decay factor for term rank |
| `KW_FIELD_WEIGHTS` | `body:3,title:2.2,header:1.8,section:1.3,docId:1.1` | Field weight mapping |
| `KW_BODY_SAT_C` | `0.6` | Saturation constant for body hits |
| `KW_EARLY_POS_TOKENS` | `250` | Token threshold for early position bonus |
| `KW_EARLY_POS_NUDGE` | `1.08` | Multiplier for early position |
| `KW_PROX_WIN` | `30` | Token window for proximity bonus |
| `KW_PROXIMITY_BETA` | `0.25` | Proximity bonus strength |
| `KW_COVERAGE_ALPHA` | `0.25` | Coverage bonus strength |
| `KW_EXCLUSIVITY_GAMMA` | `0.25` | Exclusivity penalty strength |
| `KW_CLAMP_KW_NORM` | `2.0` | Maximum normalized keyword score |
| `KW_TOPK_COVERAGE` | `2` | Number of top terms for coverage check |
| `KW_SOFTAND_STRICT` | `on` | Enable soft-AND guard |
| `KW_SOFTAND_OVERRIDE_PCTL` | `95` | Percentile threshold for soft-AND |

## Tuning Guidelines

### Recommended Ranges

- **λ (KW_LAMBDA)**: `0.1 - 0.4` - Start low, increase gradually
- **γ (KW_IDF_GAMMA)**: `0.2 - 0.5` - Higher values favor rare terms
- **δ (KW_RANK_DECAY)**: `0.8 - 0.9` - Lower values decay faster
- **Body saturation C**: `0.4 - 0.8` - Higher values saturate faster
- **Proximity β**: `0.1 - 0.3` - Adjust based on query length

### Field Weights

- Body should always be highest (2.5-4.0)
- Title secondary (1.5-3.0)
- Headers tertiary (1.0-2.0)
- Section/docId lowest (1.0-1.5)

## Telemetry

### RetrievalTrace Structure

```typescript
interface RetrievalTrace {
  queryId: string;
  tenantId?: string;
  query: string;
  terms: Array<{ term: string; weight: number; rank: number }>;
  candidates: Array<{
    id: string;
    fusedScore: number;
    keywordPoints?: {
      raw_kw: number;
      kw_norm: number;
      lambda: number;
      final_after_kw: number;
      perTerm: Array<{
        term: string;
        rank: number;
        weight: number;
        rankDecay: number;
        bestField: string;
        match: string;
        bodyHits: number;
        points: number;
      }>;
      proximity_bonus: number;
      coverage_bonus: number;
      exclusivity_multiplier: number;
    };
  }>;
  kwStats?: {
    median_raw_kw: number;
    min_norm: number;
    max_norm: number;
  };
}
```

### Reading Telemetry

- **raw_kw**: Raw keyword points before normalization
- **kw_norm**: Normalized keyword contribution (should be ~1.0 median)
- **perTerm.points**: Individual term contributions
- **proximity_bonus**: Cross-term proximity boost (>1.0 if close terms)
- **coverage_bonus**: Full coverage multiplier (>1.0 if all top terms present)

## Troubleshooting

### When kw_norm collapses to zero

- Check if terms are being extracted properly
- Verify termHits are populated in keyword search results
- Ensure field weights are reasonable

### When kw_norm explodes

- Increase KW_CLAMP_KW_NORM
- Check for over-weighting of rare terms
- Reduce KW_LAMBDA if needed

### Poor body prioritization

- Increase body field weight relative to others
- Check that body content is being indexed properly
- Verify early position nudge is working

### Proximity bonus not applying

- Ensure token positions are available in keyword search
- Check PROX_WIN is appropriate for content length
- Verify top terms are being identified correctly

## Implementation Notes

- Feature-flagged for safe rollout
- Operates after fusion but before final ranking
- Compatible with existing domainless ranking
- Deterministic for reproducible results
- Memory efficient with streaming candidate processing