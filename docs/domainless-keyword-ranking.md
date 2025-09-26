# Domainless Keyword Ranking

This document describes the domain-agnostic query analyzer and rerank features that improve end ranking when queries contain multiple important terms.

## Overview

The domainless ranking system enhances retrieval quality by analyzing query structure and corpus statistics to boost documents that comprehensively cover query intent, without requiring domain-specific rules or patterns.

## Architecture

### Core Components

#### 1. Keyphrase Extraction (`nlp/keyphrase-extract.ts`)
- **Purpose**: Extract keyphrases from queries using unsupervised methods
- **Methods**:
  - Noun-phrase chunking with capitalization/punctuation heuristics
  - TextRank-like scoring over query terms
  - IDF-weighted informative token selection
- **Output**: `QueryTerms` with ordered phrases and filtered tokens

#### 2. Corpus Statistics (`stats/corpus-stats.ts`)
- **Purpose**: Maintain corpus-level statistics for ranking features
- **Data**:
  - Document/term frequency (DF/IDF)
  - Co-occurrence counts within sliding windows
  - Pointwise Mutual Information (PMI) between terms
- **Persistence**: JSON file with TTL caching

#### 3. Alias Clustering (`sem/alias-cluster.ts`)
- **Purpose**: Build synonym clusters using embeddings and distributional similarity
- **Signals**:
  - Embedding similarity (cosine distance)
  - PMI-based distributional similarity
- **Caching**: In-memory with TTL for performance

#### 4. Coverage & Proximity (`rank/coverage-proximity.ts`)
- **Coverage**: Fraction of query term groups present in document
- **Proximity**: Min span covering one member from each group
- **Field Boost**: Additional scoring for title/header/section matches

#### 5. Exclusivity Penalty (`rank/exclusivity.ts`)
- **Purpose**: Penalize documents with mutually exclusive terms
- **Logic**: Terms with low co-occurrence get exclusivity penalties
- **Application**: Reduces scores for documents missing expected term combinations

## Integration Points

### Hybrid Search Service (`services/hybrid-search.ts`)
- Applied after fusion but before reranking
- Feature-flagged with `DOMAINLESS_RANKING_ENABLED=on`
- Multipliers: coverage (0.5x), proximity (0.3x), field boost (0.2x), exclusivity penalty (0.1x)

### Keyword Search Service (`services/keyword-search.ts`)
- Expanded retrieval (50x) when domainless ranking enabled
- Returns field match flags for ranking features

## Configuration

### Environment Variables
```bash
# Enable domainless ranking
DOMAINLESS_RANKING_ENABLED=on
FEATURES_ENABLED=on

# Keyphrase extraction
KEYPHRASE_TOP_N=3

# Alias clustering thresholds
ALIAS_EMB_SIM_TAU=0.83
ALIAS_PMI_SIM_TAU=0.30

# Ranking weights
COVERAGE_ALPHA=0.50
PROXIMITY_BETA=0.30
FIELD_BOOST_DELTA=0.20
EXCLUSIVITY_GAMMA=0.10

# Proximity window (tokens)
PROXIMITY_WINDOW=40
```

## How It Works

### Query Processing
1. Extract keyphrases from query using linguistic heuristics
2. Build alias clusters for each keyphrase using embeddings + PMI
3. Form term groups: each group = [original_term, ...aliases]

### Document Ranking
For each candidate document:
1. **Coverage**: Count groups with ≥1 member present
2. **Proximity**: Find minimum span covering all groups
3. **Field Boost**: Bonus for title/header/section matches
4. **Exclusivity**: Penalty for mutually exclusive term combinations

### Final Score
```
finalScore = fusedScore × (1 + α×coverage) × (1 + β×proximity) × (1 + δ×fieldBoost) × (1 - γ×penalty)
```

## Learning Process

### Keyphrase Learning
- Noun phrases identified via capitalization/punctuation
- Scored by IDF + co-occurrence + length bonuses
- Top N phrases selected for clustering

### Alias Learning
- Frequent terms clustered by embedding similarity
- PMI vectors used for distributional similarity
- Clusters cached with TTL for efficiency

### Exclusivity Learning
- Co-occurrence graphs built from corpus
- Low-PMI term pairs marked as exclusive
- Applied as penalties during ranking

## Examples

### Generic Query: "What is the Ultimate of the Wizard?"
- **Keyphrases**: ["ultimate wizard"]
- **Aliases**: ["ultimate wizard"] → ["ultimate", "wizard", "final ability", "supreme power"]
- **Coverage**: Documents with both "ultimate" + "wizard" get 1.0
- **Proximity**: Closer term proximity gets higher proximity scores
- **Result**: Documents comprehensively covering the query rank higher

### Multi-Term Query: "Python list comprehension syntax"
- **Keyphrases**: ["python list", "comprehension syntax"]
- **Groups**: [["python", "programming"], ["list", "array"], ["comprehension", "comp"], ["syntax", "grammar"]]
- **Ranking**: Documents covering all concepts rank above partial matches

## Performance Characteristics

- **Corpus-Driven**: All features learned from document statistics
- **Language-Agnostic**: No hardcoded vocabularies or patterns
- **Efficient**: Cached statistics and embeddings
- **Feature-Flagged**: Can be disabled without impact

## Testing

Run comprehensive tests:
```bash
npm test -- domainless-ranking.spec.ts
```

Test scenarios:
- Alias clustering accuracy
- Coverage/proximity computation
- Exclusivity penalty application
- End-to-end ranking improvements

## Monitoring

### Telemetry
Extended `RetrievalTrace` includes:
- `queryTerms`: Extracted phrases and tokens
- `groups`: Alias clusters per keyphrase
- `domainlessResults`: Per-document feature scores

### Metrics
- Coverage distribution
- Proximity improvements
- Field boost frequency
- Exclusivity penalty rates

## Future Enhancements

- **Cross-lingual support**: Extend stopword lists and heuristics
- **Dynamic clustering**: Online learning of new aliases
- **Query expansion**: Use clusters for query augmentation
- **Performance optimization**: GPU acceleration for embeddings

## Acceptance Criteria

✅ Queries with multiple important terms rank comprehensive documents above partial matches
✅ No domain-specific rules or hardcoded patterns required
✅ System remains corpus-driven and language-agnostic
✅ Feature-flagged with no performance impact when disabled
✅ Comprehensive test coverage and telemetry