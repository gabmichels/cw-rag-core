# Vector Search Strategy

## Introduction

Vector search is the foundation of semantic similarity in RAG systems. The cw-rag-core system implements a sophisticated vector search strategy using Qdrant, designed for high performance, security, and scalability in multi-tenant environments.

## Vector Search Fundamentals

### Semantic Search vs. Keyword Search

**Paradigm Comparison**:

| Aspect | Keyword Search | Vector Search |
|--------|----------------|---------------|
| **Matching** | Exact text matches | Semantic similarity |
| **Understanding** | Surface-level tokens | Deep meaning representation |
| **Synonyms** | Requires explicit handling | Natural synonym understanding |
| **Context** | Limited context awareness | Rich contextual understanding |
| **Precision** | High for exact matches | High for conceptual matches |

**Vector Search Advantages**:
```typescript
interface VectorSearchBenefits {
  // Semantic understanding
  semanticMatching: {
    capability: "Understand meaning beyond keywords";
    example: "Query 'car' matches documents about 'automobile', 'vehicle'";
    technique: "Learned embeddings capture semantic relationships";
  };

  // Cross-lingual capabilities
  multilingualSearch: {
    capability: "Search across languages with multilingual embeddings";
    example: "English query finds relevant French documents";
    implementation: "Language-agnostic vector representations";
  };

  // Contextual relevance
  contextualMatching: {
    capability: "Consider document context and domain";
    example: "Apple matches fruit context vs. technology context";
    mechanism: "Embeddings encode contextual meaning";
  };

  // Fuzzy matching
  approximateMatching: {
    capability: "Handle typos and variations naturally";
    example: "Misspelled queries still find relevant content";
    robustness: "Vector space proximity handles variations";
  };
}
```

### Mathematical Foundation

**Vector Space Model**:
```typescript
interface VectorSpaceModel {
  // Document representation
  documentVectors: {
    dimension: 1536;                    // Standard embedding dimension
    space: "High-dimensional Euclidean space";
    encoding: "Dense vector representation of semantic content";
  };

  // Similarity computation
  similarityMeasure: {
    metric: "Cosine similarity";
    formula: "cos(θ) = (A · B) / (||A|| × ||B||)";
    range: "[-1, 1], typically [0, 1] for text";
    interpretation: "1 = identical, 0 = orthogonal, -1 = opposite";
  };

  // Distance conversion
  distanceConversion: {
    qdrantDistance: "1 - cosine_similarity";
    range: "[0, 2], typically [0, 1] for text";
    interpretation: "0 = identical, 1 = orthogonal, 2 = opposite";
  };
}
```

**Cosine Similarity Implementation**:
```typescript
// Mathematical basis for similarity computation
function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  // Dot product
  const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);

  // Magnitudes
  const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));

  // Cosine similarity
  return dotProduct / (magnitudeA * magnitudeB);
}

// Why cosine similarity for text
interface CosineSimilarityAdvantages {
  normalization: "Handles variable document lengths";
  scale: "Independent of vector magnitude";
  interpretation: "Intuitive similarity scores";
  efficiency: "Optimized in vector databases";
}
```

## Qdrant Vector Search Implementation

### Search Pipeline Architecture

**Query Processing Flow**:
```
[User Query]
    → [Query Embedding Generation]
    → [Security Filter Construction]
    → [Vector Search Execution]
    → [Result Post-processing]
    → [Ranked Document List]
```

**Implementation Details**:
```typescript
// From apps/api/src/services/qdrant.ts
export async function searchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  request: RetrievalRequest,
  userTenants: string[],
  userAcl: string[]
): Promise<PointStruct[]> {

  // 1. Query vector generation (Phase 1: stubbed)
  const queryVector = generateRandomVector(DOCUMENT_VECTOR_DIMENSION);

  // 2. Security filter construction
  const filter = {
    must: [
      {
        key: 'tenant',
        match: { any: userTenants }      // Tenant isolation
      },
      {
        key: 'acl',
        match: { any: userAcl }          // Access control
      }
    ]
  };

  // 3. Vector search execution
  const searchResult = await qdrantClient.search(collectionName, {
    vector: queryVector,               // Query embedding
    limit: request.limit || 5,         // Result count
    filter: filter,                    // Security filters
    with_payload: true,                // Include metadata
    params: {
      hnsw_ef: 128,                    // Search precision parameter
      exact: false                     // Use approximate search
    }
  });

  // 4. Result transformation
  return searchResult.map(hit => ({
    id: hit.id,
    vector: hit.vector || [],
    payload: hit.payload || {},
    score: hit.score                   // Similarity score
  }));
}
```

### HNSW Index Optimization

**Hierarchical Navigable Small World (HNSW) Algorithm**:
```typescript
interface HNSWConfiguration {
  // Index construction parameters
  construction: {
    m: 16;                            // Bi-directional links per node
    efConstruct: 100;                 // Dynamic candidate list size
    maxM: 16;                         // Maximum connections
    maxM0: 32;                        // Layer 0 maximum connections
  };

  // Search parameters
  search: {
    ef: 128;                          // Search expansion factor
    dynamic: true;                    // Runtime configurable
    tradeoff: "Higher ef = better recall, slower search";
  };

  // Performance characteristics
  performance: {
    complexity: "O(log n) search time";
    recall: "95%+ recall with ef=128";
    latency: "2-10ms for 1M vectors";
    memory: "~4GB for 1M vectors (1536-dim)";
  };
}
```

**Index Tuning Strategy**:
```typescript
interface IndexTuning {
  // Build-time optimization
  buildOptimization: {
    efConstruct: {
      value: 100;
      rationale: "Balance build time vs. index quality";
      impact: "Higher values improve recall but slow indexing";
    };

    m: {
      value: 16;
      rationale: "Optimal connectivity for text embeddings";
      impact: "Higher values improve recall, increase memory usage";
    };
  };

  // Query-time optimization
  queryOptimization: {
    ef: {
      default: 128;
      adaptive: "Increase for critical queries";
      monitoring: "Track recall vs. latency metrics";
    };

    exact: {
      usage: "Disable for production (use approximate)";
      performance: "10x+ speedup with minimal recall loss";
    };
  };
}
```

## Multi-Tenant Vector Search

### Security-First Search Design

**Tenant Isolation at Vector Level**:
```typescript
interface TenantVectorSecurity {
  // Database-level filtering
  databaseFiltering: {
    implementation: "Qdrant payload filters";
    performance: "Indexed filtering for O(log n) lookup";
    guarantee: "No cross-tenant vector access";
  };

  // Filter construction
  filterConstruction: {
    tenant: {
      key: 'tenant';
      match: { any: [userContext.tenantId] };
      cardinality: "Low (10-1000 tenants)";
      selectivity: "High (eliminates 99%+ of data)";
    };

    acl: {
      key: 'acl';
      match: { any: [userId, ...userGroupIds] };
      cardinality: "Medium (100-10K unique ACL entries)";
      selectivity: "Medium (filters documents within tenant)";
    };
  };
}
```

**Security Performance Impact**:
```typescript
interface SecurityPerformanceImpact {
  // Filter efficiency
  filterPerformance: {
    tenantFilter: {
      cost: "~1ms overhead";
      optimization: "Keyword index on tenant field";
      scaling: "Constant time with index";
    };

    aclFilter: {
      cost: "~2-3ms overhead";
      optimization: "Keyword array index on ACL field";
      scaling: "Linear with user's group count";
    };
  };

  // Overall impact
  searchPerformance: {
    baseline: "2-5ms without filters";
    withSecurity: "5-10ms with tenant + ACL filters";
    overhead: "50-100% latency increase for security";
    acceptable: "Trade-off for complete data isolation";
  };
}
```

### Cross-Tenant Search Prevention

**Architecture Guarantees**:
```typescript
interface CrossTenantPrevention {
  // Database-level guarantees
  databaseLevel: {
    filtering: "Every query includes mandatory tenant filter";
    indexing: "Tenant field indexed for efficient filtering";
    validation: "No query can bypass tenant constraints";
  };

  // Application-level guarantees
  applicationLevel: {
    context: "User context propagated through entire request";
    validation: "Double-check tenant ownership in results";
    logging: "All tenant access logged for audit";
  };

  // Monitoring and detection
  monitoring: {
    crossTenantAttempts: "Monitor for attempts to access other tenants";
    anomalyDetection: "Detect unusual access patterns";
    alerting: "Real-time alerts for security violations";
  };
}
```

## Search Quality and Relevance

### Embedding Quality for Search

**Embedding Characteristics for Optimal Search**:
```typescript
interface EmbeddingQuality {
  // Semantic representation
  semanticFidelity: {
    capture: "Capture semantic meaning accurately";
    similarity: "Similar concepts cluster in vector space";
    distinction: "Different concepts remain distinguishable";
  };

  // Dimensional efficiency
  dimensionalEfficiency: {
    dimension: 1536;                   // Standard for high-quality embeddings
    information: "Dense information encoding";
    redundancy: "Minimal redundant dimensions";
  };

  // Consistency and stability
  consistency: {
    reproducibility: "Same input produces same embedding";
    stability: "Minor input changes = minor vector changes";
    normalization: "Consistent vector magnitudes";
  };
}
```

**Domain Adaptation Strategy**:
```typescript
interface DomainAdaptation {
  // General vs. specialized embeddings
  embeddingChoice: {
    general: {
      model: "OpenAI text-embedding-ada-002";
      strength: "Broad domain coverage";
      weakness: "May miss domain-specific nuances";
    };

    specialized: {
      model: "Domain-specific fine-tuned embeddings";
      strength: "Optimized for specific content types";
      implementation: "Fine-tune on domain corpus";
    };
  };

  // Quality evaluation
  qualityMetrics: {
    similarity: "Human evaluation of similar document pairs";
    retrieval: "Recall@k and precision@k metrics";
    relevance: "Domain expert evaluation of search results";
  };
}
```

### Result Ranking and Scoring

**Multi-Signal Ranking**:
```typescript
interface RankingStrategy {
  // Primary signal: Vector similarity
  vectorSimilarity: {
    weight: 0.8;                       // Primary ranking factor
    computation: "Cosine similarity score";
    range: "[0, 1]";
    interpretation: "Semantic relevance to query";
  };

  // Secondary signals (future enhancement)
  secondarySignals: {
    textual: {
      weight: 0.1;
      signal: "BM25 keyword matching score";
      purpose: "Catch important keyword matches";
    };

    freshness: {
      weight: 0.05;
      signal: "Document recency score";
      computation: "Exponential decay from publication date";
    };

    authority: {
      weight: 0.05;
      signal: "Source authority score";
      computation: "Manual curation + usage patterns";
    };
  };
}
```

**Score Normalization and Calibration**:
```typescript
interface ScoreNormalization {
  // Similarity score calibration
  calibration: {
    raw: "Raw cosine similarity [0, 1]";
    calibrated: "Calibrated relevance score [0, 1]";
    method: "Sigmoid transformation for better distribution";
  };

  // Threshold setting
  thresholds: {
    highRelevance: 0.8;               // Clearly relevant
    mediumRelevance: 0.6;             // Potentially relevant
    lowRelevance: 0.4;                // Marginally relevant
    threshold: 0.3;                   // Minimum for inclusion
  };

  // Score interpretation
  interpretation: {
    confidence: "Higher scores = higher confidence";
    ranking: "Primary sort by similarity score";
    filtering: "Optional minimum threshold filtering";
  };
}
```

## Advanced Search Capabilities

### Hybrid Search Strategy

**Vector + Keyword Hybrid Approach**:
```typescript
// Future enhancement: Combine vector and keyword search
interface HybridSearch {
  // Dual retrieval paths
  retrievalPaths: {
    vectorSearch: {
      strength: "Semantic similarity and concept matching";
      weakness: "May miss exact keyword matches";
      coverage: "Broad conceptual relevance";
    };

    keywordSearch: {
      strength: "Exact term and phrase matching";
      weakness: "Limited semantic understanding";
      coverage: "Precise lexical matches";
    };
  };

  // Result fusion
  resultFusion: {
    strategy: "Reciprocal Rank Fusion (RRF)";
    formula: "score = Σ(1/(rank_i + k)) for each retrieval method";
    parameter: "k = 60 (standard RRF parameter)";
    benefit: "Combines best of both approaches";
  };

  // Query routing
  queryRouting: {
    factual: "Hybrid search for factual queries";
    conceptual: "Vector-heavy for conceptual queries";
    specific: "Keyword-heavy for specific term searches";
    adaptive: "Machine learning to determine optimal mix";
  };
}
```

### Search Result Diversification

**Avoiding Result Redundancy**:
```typescript
interface ResultDiversification {
  // Maximal Marginal Relevance (MMR)
  mmr: {
    formula: "MMR = λ × relevance - (1-λ) × max_similarity_to_selected";
    lambda: 0.7;                     // Balance relevance vs. diversity
    implementation: "Post-processing step after initial retrieval";
    benefit: "Broader coverage of query aspects";
  };

  // Clustering-based diversity
  clustering: {
    algorithm: "K-means clustering on embeddings";
    clusters: "Adaptive number based on result set";
    selection: "Top result from each cluster";
    purpose: "Ensure diverse perspectives represented";
  };

  // Source-based diversity
  sourceDiversity: {
    maxPerSource: 3;                 // Limit results per source
    rationale: "Prevent single source domination";
    implementation: "Post-filtering based on source metadata";
  };
}
```

### Query Expansion and Enhancement

**Query Understanding and Enhancement**:
```typescript
interface QueryEnhancement {
  // Query expansion
  expansion: {
    synonyms: "Add relevant synonyms to query";
    related: "Include conceptually related terms";
    embedding: "Use query embedding to find similar concepts";
  };

  // Query reformulation
  reformulation: {
    clarification: "Clarify ambiguous queries";
    specificity: "Make overly broad queries more specific";
    context: "Add domain context to queries";
  };

  // Multi-query approach
  multiQuery: {
    variants: "Generate multiple query variations";
    execution: "Search with each variant";
    fusion: "Combine results from all variants";
    coverage: "Improved recall through query diversity";
  };
}
```

## Performance Optimization

### Search Performance Tuning

**Latency Optimization**:
```typescript
interface LatencyOptimization {
  // Index optimization
  indexOptimization: {
    hnsw_ef: {
      default: 128;
      lowLatency: 64;                // Faster search, slightly lower recall
      highRecall: 256;               // Higher recall, slower search
      adaptive: "Dynamic based on query importance";
    };

    segmentation: {
      strategy: "Optimal segment size for search performance";
      size: 20000;                   // Vectors per segment
      impact: "Balance memory usage and search speed";
    };
  };

  // Caching strategy
  caching: {
    queryCache: {
      keys: "Query vector + filter hash";
      ttl: 300;                      // 5-minute cache
      hitRate: "70%+ for common queries";
    };

    vectorCache: {
      keys: "Document content hash";
      ttl: 3600;                     // 1-hour cache for embeddings
      purpose: "Avoid re-embedding common documents";
    };
  };
}
```

**Throughput Optimization**:
```typescript
interface ThroughputOptimization {
  // Batch processing
  batchProcessing: {
    queryBatching: "Process multiple queries together";
    vectorization: "Batch embedding generation";
    efficiency: "Amortize overhead across multiple operations";
  };

  // Connection pooling
  connectionPooling: {
    qdrantConnections: "Pool of persistent connections";
    poolSize: 10;                    // Connections per API instance
    reuseStrategy: "Round-robin connection selection";
  };

  // Parallel processing
  parallelization: {
    multiThreading: "Parallel search execution";
    asyncProcessing: "Non-blocking I/O operations";
    scaling: "Linear speedup with CPU cores";
  };
}
```

### Scalability Considerations

**Horizontal Scaling Strategy**:
```typescript
interface HorizontalScaling {
  // Qdrant cluster scaling
  clusterScaling: {
    sharding: "Shard by tenant for natural partitioning";
    replication: "3-replica setup for availability";
    consistency: "Eventually consistent reads";
    routing: "Client-side shard routing";
  };

  // Search node scaling
  searchNodeScaling: {
    loadBalancing: "Distribute search load across nodes";
    caching: "Shared cache layer for efficiency";
    coordination: "Centralized query coordination";
  };

  // Performance projections
  scalingProjections: {
    documents: "100M+ documents across cluster";
    queries: "10K+ QPS with proper scaling";
    latency: "Sub-50ms response times at scale";
  };
}
```

## Monitoring and Analytics

### Search Quality Metrics

**Performance Monitoring**:
```typescript
interface SearchMetrics {
  // Latency metrics
  latency: {
    p50: "Median search response time";
    p95: "95th percentile response time";
    p99: "99th percentile response time";
    target: "P95 < 50ms, P99 < 100ms";
  };

  // Quality metrics
  quality: {
    recall: "Percentage of relevant documents retrieved";
    precision: "Percentage of retrieved documents that are relevant";
    mrr: "Mean Reciprocal Rank of first relevant result";
    ndcg: "Normalized Discounted Cumulative Gain";
  };

  // User engagement metrics
  engagement: {
    clickthrough: "CTR on search results";
    dwellTime: "Time spent on retrieved documents";
    satisfaction: "User satisfaction ratings";
    taskCompletion: "Query resolution success rate";
  };
}
```

**Search Analytics Dashboard**:
```typescript
interface SearchAnalytics {
  // Query analysis
  queryAnalysis: {
    frequency: "Most common query patterns";
    performance: "Query performance by type";
    failures: "Queries with poor results";
    trends: "Query volume and pattern trends";
  };

  // Result analysis
  resultAnalysis: {
    distribution: "Score distribution analysis";
    coverage: "Document coverage in results";
    diversity: "Result diversity metrics";
    relevance: "Relevance assessment tracking";
  };

  // System health
  systemHealth: {
    indexHealth: "Index optimization status";
    resourceUsage: "CPU, memory, disk utilization";
    errorRates: "Search error frequency and types";
    capacity: "Current capacity vs. limits";
  };
}
```

---

**Next**: Learn about [Document Lifecycle](document-lifecycle.md) and the complete pipeline from ingestion to retrieval.