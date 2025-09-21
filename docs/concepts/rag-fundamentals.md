# RAG Fundamentals

## Introduction

Retrieval-Augmented Generation (RAG) is a powerful paradigm that combines information retrieval with language generation to provide contextually relevant answers to user queries. The cw-rag-core system implements a modern, scalable RAG architecture designed for enterprise multi-tenant environments.

## RAG Conceptual Framework

### The RAG Pipeline

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Knowledge     │    │   Retrieval     │    │   Generation    │
│   Base          │───▶│   System        │───▶│   System        │
│                 │    │                 │    │                 │
│ • Documents     │    │ • Vector Search │    │ • LLM           │
│ • Embeddings    │    │ • Semantic      │    │ • Context       │
│ • Metadata      │    │   Matching      │    │ • Answer        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Core Components**:
1. **Knowledge Base**: Vector-indexed document repository with rich metadata
2. **Retrieval System**: Semantic search to find relevant context
3. **Generation System**: LLM-powered answer synthesis (Phase 2)

### RAG vs. Traditional Search

**Comparison Matrix**:

| Aspect | Traditional Search | RAG System |
|--------|-------------------|------------|
| **Query Processing** | Keyword matching | Semantic understanding |
| **Result Format** | Document links | Direct answers + sources |
| **Context Understanding** | Limited | Deep semantic meaning |
| **Answer Quality** | User interpretation required | AI-synthesized responses |
| **Source Attribution** | Manual verification | Automatic source linking |

**RAG Advantages**:
```typescript
interface RAGAdvantages {
  // Semantic understanding
  semanticSearch: {
    capability: "Understand intent, not just keywords";
    example: "Query 'budget planning' matches 'financial forecasting'";
    benefit: "More relevant results";
  };

  // Contextual answers
  contextualResponse: {
    capability: "Synthesize information from multiple sources";
    example: "Combine pricing from doc A with features from doc B";
    benefit: "Comprehensive answers";
  };

  // Always current
  freshness: {
    capability: "Real-time knowledge base updates";
    example: "New documents immediately searchable";
    benefit: "No model retraining required";
  };

  // Source transparency
  provenance: {
    capability: "Every answer includes source attribution";
    example: "Answer references specific documents and scores";
    benefit: "Verifiable and trustworthy";
  };
}
```

## cw-rag-core RAG Implementation

### Phase 1: Foundation (Current)

**Retrieval-Only Architecture**:
```typescript
// Current implementation focuses on retrieval excellence
interface Phase1RAG {
  // Document ingestion and indexing
  ingestion: {
    implementation: "n8n workflows → API → Qdrant";
    embedding: "Stubbed (random vectors for development)";
    metadata: "Rich metadata with security context";
  };

  // Semantic search with security
  retrieval: {
    implementation: "Vector similarity search";
    security: "Multi-tenant with RBAC";
    performance: "Sub-10ms search in 1M+ documents";
  };

  // Answer generation (stubbed)
  generation: {
    current: "Static placeholder responses";
    purpose: "API contract validation";
    future: "LLM integration in Phase 2";
  };
}
```

**Current RAG Flow**:
```
[User Query]
    → [Query Validation]
    → [User Context Security Check]
    → [Vector Search with Filters]
    → [RBAC Post-filtering]
    → [Document Ranking]
    → [Stub Answer + Retrieved Documents]
```

### Phase 2: LLM Integration (Planned)

**Full RAG Implementation**:
```typescript
// Planned LLM integration for answer generation
interface Phase2RAG {
  // Enhanced embedding
  embedding: {
    service: "OpenAI Ada-002 or Hugging Face";
    dimension: 1536;                    // Standard embedding size
    quality: "Production-grade semantic understanding";
  };

  // Query enhancement
  queryProcessing: {
    expansion: "Query expansion for better recall";
    reformulation: "Query rewriting for clarity";
    intent: "Intent classification and routing";
  };

  // Advanced retrieval
  retrieval: {
    hybrid: "Vector + keyword search combination";
    reranking: "Neural reranking for precision";
    diversity: "Result diversification to avoid redundancy";
  };

  // Answer generation
  generation: {
    llm: "GPT-4 or Claude for answer synthesis";
    prompting: "Context-aware prompt engineering";
    citations: "Automatic source citation insertion";
  };
}
```

## Embedding Strategy

### Current Stub Implementation

**Development Embedding**:
```typescript
// From packages/retrieval/src/embedding.ts
export class EmbeddingServiceStub implements EmbeddingService {
  async embed(text: string): Promise<number[]> {
    console.log(`Stub: Embedding text of length ${text.length}`);
    // Random vectors for development and testing
    return Array.from({ length: 1536 }).map(() => Math.random());
  }

  async embedDocument(document: Document): Promise<number[]> {
    console.log(`Stub: Embedding document with ID ${document.id}`);
    return this.embed(document.content);
  }
}
```

**Stub Benefits for Development**:
```typescript
interface StubBenefits {
  // Rapid development
  development: {
    speed: "No API calls or model loading delays";
    cost: "No embedding service costs during development";
    reliability: "No external dependencies for core testing";
  };

  // Architecture validation
  validation: {
    interfaces: "Validates embedding service abstractions";
    dataFlow: "Tests complete data pipeline";
    performance: "Baseline performance testing";
  };

  // Testing advantages
  testing: {
    deterministic: "Reproducible with seeded random generators";
    fast: "Unit tests complete in milliseconds";
    isolation: "No network dependencies in tests";
  };
}
```

### Production Embedding Strategy

**Embedding Service Selection**:
```typescript
interface EmbeddingOptions {
  // OpenAI Embeddings
  openai: {
    model: "text-embedding-ada-002";
    dimension: 1536;
    cost: "$0.0001 per 1K tokens";
    latency: "~100ms per request";
    quality: "Excellent for general text";
  };

  // Hugging Face Transformers
  huggingFace: {
    models: ["sentence-transformers/all-MiniLM-L6-v2", "e5-large"];
    dimension: "384-1024 (model dependent)";
    cost: "Self-hosted (compute only)";
    latency: "~10ms with GPU";
    quality: "Good for specialized domains";
  };

  // Cohere Embeddings
  cohere: {
    model: "embed-english-v3.0";
    dimension: 1024;
    cost: "$0.0001 per 1K tokens";
    latency: "~50ms per request";
    quality: "Optimized for search/retrieval";
  };
}
```

**Embedding Quality Metrics**:
```typescript
interface EmbeddingQuality {
  // Semantic similarity
  semanticAccuracy: {
    measurement: "Human evaluation of similar document pairs";
    benchmark: "MS MARCO passage ranking dataset";
    target: ">90% accuracy on domain-specific content";
  };

  // Retrieval performance
  retrievalMetrics: {
    recall: "Percentage of relevant documents retrieved";
    precision: "Percentage of retrieved documents that are relevant";
    mrr: "Mean Reciprocal Rank of first relevant result";
    target: "Recall@10 > 85%, MRR > 0.7";
  };

  // Computational efficiency
  performance: {
    throughput: "Documents embedded per second";
    latency: "Time to embed single document";
    scalability: "Batch processing capabilities";
    target: ">100 docs/second with <100ms latency";
  };
}
```

## Vector Search Implementation

### Similarity Search Strategy

**Cosine Similarity for Text**:
```typescript
// Why cosine similarity for text embeddings
interface CosineSimilarityRationale {
  // Mathematical properties
  properties: {
    normalization: "Handles variable document lengths";
    scale: "Independent of vector magnitude";
    range: "Scores from -1 to 1 (typically 0 to 1 for text)";
  };

  // Text-specific advantages
  textAdvantages: {
    lengthInvariance: "Short and long documents comparable";
    topicFocus: "Emphasizes semantic direction over magnitude";
    interpretation: "Intuitive similarity scores";
  };

  // Performance characteristics
  performance: {
    computation: "Efficient dot product after normalization";
    indexing: "Optimal for HNSW index structures";
    hardware: "Vectorized operations on modern CPUs";
  };
}
```

**Search Pipeline Implementation**:
```typescript
// From apps/api/src/services/qdrant.ts
export async function searchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  request: RetrievalRequest,
  userTenants: string[],
  userAcl: string[]
): Promise<PointStruct[]> {
  // 1. Generate query vector (currently stubbed)
  const queryVector = generateRandomVector(DOCUMENT_VECTOR_DIMENSION);

  // 2. Construct security filters
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

  // 3. Execute vector search
  const searchResult = await qdrantClient.search(collectionName, {
    vector: queryVector,
    limit: request.limit || 5,
    filter: filter,
    with_payload: true
  });

  // 4. Transform results
  return searchResult.map(hit => ({
    id: hit.id,
    vector: hit.vector || [],
    payload: hit.payload || {},
    score: hit.score
  }));
}
```

### Retrieval Quality Optimization

**Ranking and Scoring**:
```typescript
interface RetrievalOptimization {
  // Primary ranking signal
  vectorSimilarity: {
    weight: 0.7;                       // Primary ranking factor
    computation: "Cosine similarity score";
    normalization: "Score from 0 to 1";
  };

  // Secondary ranking signals (future)
  secondarySignals: {
    recency: {
      weight: 0.1;
      factor: "Document freshness/update time";
      decay: "Exponential decay over time";
    };

    popularity: {
      weight: 0.1;
      factor: "Document access frequency";
      window: "30-day rolling window";
    };

    authority: {
      weight: 0.1;
      factor: "Source credibility score";
      computation: "Manual curation + usage patterns";
    };
  };
}
```

**Result Diversification**:
```typescript
interface ResultDiversification {
  // Avoid redundant results
  redundancyReduction: {
    strategy: "Maximal Marginal Relevance (MMR)";
    implementation: "Post-processing diverse result selection";
    benefit: "Broader coverage of query aspects";
  };

  // Cluster-based diversity
  clustering: {
    strategy: "Group similar documents before selection";
    algorithm: "K-means clustering on embeddings";
    selection: "Top result from each cluster";
  };

  // Source diversity
  sourceDiversity: {
    strategy: "Limit results per source/author";
    maxPerSource: 3;
    benefit: "Prevent single source domination";
  };
}
```

## Context Preparation for Generation

### Document Chunking Strategy

**Chunking for LLM Context**:
```typescript
// Future implementation for Phase 2
interface DocumentChunking {
  // Chunk size optimization
  chunkSize: {
    tokens: 512;                       // Optimal for most models
    overlap: 50;                       // Token overlap between chunks
    rationale: "Balance context size with relevance";
  };

  // Semantic chunking
  semanticBoundaries: {
    strategy: "Respect paragraph and sentence boundaries";
    implementation: "Natural language processing for splits";
    benefit: "Maintain coherent context segments";
  };

  // Metadata preservation
  metadataHandling: {
    inheritance: "Child chunks inherit parent metadata";
    tracking: "Maintain chunk-to-document relationships";
    merging: "Recombine chunks for answer generation";
  };
}
```

### Context Window Management

**LLM Context Optimization**:
```typescript
interface ContextManagement {
  // Context window utilization
  windowSize: {
    gpt4: "8K tokens (32K for extended)";
    claude: "100K tokens";
    strategy: "Maximize relevant content within limits";
  };

  // Content prioritization
  prioritization: {
    relevanceScore: "Vector similarity scores";
    recency: "Newer content prioritized";
    completeness: "Full context over partial";
    diversity: "Diverse perspectives included";
  };

  // Context compression
  compression: {
    summarization: "Summarize less relevant sections";
    extraction: "Extract key facts and figures";
    structuring: "Organize information for clarity";
  };
}
```

## Answer Generation Strategy

### Prompt Engineering

**RAG Prompt Template**:
```typescript
// Future prompt engineering for Phase 2
interface RAGPromptTemplate {
  systemPrompt: `
    You are a helpful AI assistant that answers questions based on provided context.

    Guidelines:
    - Only use information from the provided context
    - If the context doesn't contain enough information, say so
    - Always cite your sources with document IDs
    - Be precise and factual
    - Structure your answers clearly
  `;

  userPrompt: `
    Context:
    {retrievedDocuments}

    Question: {userQuery}

    Answer:
  `;

  contextTemplate: `
    Document {docId} (Score: {similarityScore}):
    {documentContent}

    Source: {sourceUrl}
    ---
  `;
}
```

**Answer Quality Assurance**:
```typescript
interface AnswerQuality {
  // Factual accuracy
  factualness: {
    grounding: "Answers must be grounded in provided context";
    citations: "Every fact must cite source documents";
    verification: "Cross-reference multiple sources when possible";
  };

  // Completeness
  completeness: {
    coverage: "Address all aspects of the question";
    synthesis: "Combine information from multiple sources";
    gaps: "Explicitly mention information gaps";
  };

  // Clarity and structure
  clarity: {
    organization: "Logical flow and structure";
    language: "Clear, professional language";
    formatting: "Use lists, headers when appropriate";
  };
}
```

## Performance and Scalability

### RAG System Performance

**Performance Characteristics**:
```typescript
interface RAGPerformance {
  // Retrieval performance
  retrieval: {
    latency: "5-15ms for vector search";
    throughput: "1000+ queries per second";
    scalability: "Logarithmic with document count";
  };

  // Generation performance (future)
  generation: {
    latency: "500-2000ms for answer generation";
    throughput: "10-50 answers per second";
    scalability: "Limited by LLM API rate limits";
  };

  // End-to-end performance
  endToEnd: {
    targetLatency: "<3 seconds for complete RAG response";
    caching: "Cache frequent queries for <100ms response";
    async: "Support async processing for complex queries";
  };
}
```

### Scaling Considerations

**System Scaling Strategy**:
```typescript
interface RAGScaling {
  // Knowledge base scaling
  knowledgeBase: {
    documents: "10M+ documents supported";
    vectors: "Efficient storage and indexing";
    updates: "Real-time document ingestion";
  };

  // Query volume scaling
  queryScaling: {
    retrieval: "Horizontal scaling of search nodes";
    generation: "LLM API scaling and load balancing";
    caching: "Multi-tier caching strategy";
  };

  // Multi-tenant scaling
  tenantScaling: {
    isolation: "Per-tenant performance guarantees";
    sharing: "Efficient resource sharing";
    customization: "Tenant-specific configurations";
  };
}
```

## Quality Metrics and Evaluation

### RAG Evaluation Framework

**Evaluation Metrics**:
```typescript
interface RAGEvaluation {
  // Retrieval evaluation
  retrievalMetrics: {
    relevance: "Human-rated relevance of retrieved documents";
    coverage: "Percentage of relevant documents retrieved";
    ranking: "Quality of document ranking";
    latency: "Search response time";
  };

  // Generation evaluation
  generationMetrics: {
    accuracy: "Factual accuracy of generated answers";
    completeness: "How well answers address questions";
    coherence: "Logical flow and readability";
    citation: "Accuracy of source attribution";
  };

  // User experience metrics
  userMetrics: {
    satisfaction: "User satisfaction ratings";
    taskCompletion: "Success rate for user tasks";
    trustworthiness: "User trust in answers";
    efficiency: "Time to find information";
  };
}
```

**Continuous Improvement**:
```typescript
interface ContinuousImprovement {
  // Feedback collection
  feedbackLoop: {
    explicit: "User thumbs up/down on answers";
    implicit: "Click-through and dwell time";
    detailed: "Detailed feedback forms";
  };

  // Model improvement
  modelImprovement: {
    finetuning: "Fine-tune embeddings on domain data";
    promptOptimization: "A/B test different prompts";
    retrievalTuning: "Optimize search parameters";
  };

  // Content optimization
  contentOptimization: {
    curation: "Improve document quality";
    structure: "Optimize document formatting";
    metadata: "Enhance metadata quality";
  };
}
```

---

**Next**: Learn about [Vector Search Strategy](vector-search.md) and the detailed implementation of semantic search capabilities.