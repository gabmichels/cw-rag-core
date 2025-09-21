# Document Lifecycle

## Introduction

The document lifecycle in cw-rag-core encompasses the complete journey of information from initial ingestion through to retrieval and potential updates or deletion. Understanding this lifecycle is crucial for system administrators, developers, and users who need to manage knowledge effectively in the RAG system.

## Lifecycle Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Ingestion    │───▶│    Processing   │───▶│     Storage     │
│                 │    │                 │    │                 │
│ • Data Sources  │    │ • Validation    │    │ • Vector DB     │
│ • Format Det.   │    │ • Normalization │    │ • Metadata      │
│ • Initial Val.  │    │ • Embedding     │    │ • Indexing      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Retrieval    │    │     Updates     │    │    Deletion     │
│                 │    │                 │    │                 │
│ • Query Proc.   │    │ • Version Mgmt  │    │ • Soft Delete   │
│ • Vector Search │    │ • Re-indexing   │    │ • Hard Delete   │
│ • Result Rank   │    │ • Consistency   │    │ • Cleanup       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Phase 1: Document Ingestion

### Data Source Integration

**Multiple Ingestion Pathways**:
```typescript
interface IngestionSources {
  // Direct API ingestion
  directAPI: {
    endpoint: "/ingest/normalize";
    method: "POST";
    use_case: "Real-time document addition";
    source: "Web applications, external services";
  };

  // n8n workflow automation
  workflowAutomation: {
    trigger: "n8n webhook or scheduled workflow";
    processing: "Data transformation and normalization";
    use_case: "Batch processing, external system integration";
    source: "File systems, databases, APIs, web scraping";
  };

  // Manual upload (future)
  manualUpload: {
    interface: "Web UI file upload";
    formats: "PDF, Word, text files";
    use_case: "User-initiated document addition";
    source: "Local files, one-off uploads";
  };

  // Bulk import (future)
  bulkImport: {
    mechanism: "Batch API or file-based import";
    scale: "Thousands of documents";
    use_case: "Initial system population, migrations";
    source: "Existing document repositories";
  };
}
```

**Data Format Handling**:
```typescript
interface FormatHandling {
  // Text-based formats
  textFormats: {
    plainText: {
      processing: "Direct ingestion";
      encoding: "UTF-8";
      validation: "Character encoding validation";
    };

    markdown: {
      processing: "Preserve structure, convert to text";
      metadata: "Extract headers as keywords";
      links: "Preserve internal link structure";
    };

    json: {
      processing: "Extract text fields";
      structure: "Preserve hierarchical metadata";
      schema: "Validate against expected schema";
    };
  };

  // Rich document formats (future)
  richFormats: {
    pdf: {
      extraction: "Text extraction with layout preservation";
      metadata: "Title, author, creation date";
      pages: "Page-level chunking for large documents";
    };

    docx: {
      extraction: "Content extraction via parsing libraries";
      structure: "Preserve headings and formatting";
      metadata: "Document properties and custom fields";
    };

    html: {
      extraction: "Text content extraction";
      cleanup: "Remove scripts, styles, navigation";
      structure: "Preserve semantic HTML structure";
    };
  };
}
```

### Input Validation and Sanitization

**Multi-Layer Validation**:
```typescript
// From apps/api/src/routes/ingestNormalize.ts
interface ValidationLayers {
  // Schema validation (JSON Schema)
  schemaValidation: {
    implementation: "Fastify JSON Schema validation";
    scope: "Request structure, data types, required fields";
    error_handling: "400 Bad Request with detailed errors";
  };

  // Business rule validation
  businessValidation: {
    content_length: "1 char minimum, 100KB maximum";
    tenant_validation: "Valid tenant ID format";
    acl_validation: "Non-empty ACL array";
    metadata_size: "Total metadata < 10MB";
  };

  // Security validation
  securityValidation: {
    content_sanitization: "Remove potentially harmful content";
    metadata_validation: "Validate URLs, file paths";
    injection_prevention: "Prevent code injection attempts";
  };

  // Data quality validation
  qualityValidation: {
    content_language: "Language detection and validation";
    duplicate_detection: "Check for existing documents";
    content_quality: "Minimum content quality threshold";
  };
}
```

**Validation Implementation**:
```typescript
// Example validation workflow
async function validateDocument(document: Omit<Document, 'id'>): Promise<ValidationResult> {
  const errors: string[] = [];

  // Content validation
  if (!document.content || document.content.trim().length === 0) {
    errors.push("Document content cannot be empty");
  }

  if (document.content.length > 100000) {
    errors.push("Document content exceeds maximum length (100KB)");
  }

  // Metadata validation
  if (!document.metadata.tenantId) {
    errors.push("Tenant ID is required");
  }

  if (!document.metadata.acl || document.metadata.acl.length === 0) {
    errors.push("Access control list cannot be empty");
  }

  // URL validation (if provided)
  if (document.metadata.url) {
    try {
      new URL(document.metadata.url);
    } catch {
      errors.push("Invalid URL format");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

## Phase 2: Document Processing

### Content Normalization

**Text Normalization Pipeline**:
```typescript
interface ContentNormalization {
  // Text cleaning
  textCleaning: {
    whitespace: "Normalize whitespace and line endings";
    encoding: "Ensure consistent UTF-8 encoding";
    special_chars: "Handle special characters and symbols";
    formatting: "Remove or preserve formatting marks";
  };

  // Language processing
  languageProcessing: {
    detection: "Automatic language detection";
    normalization: "Case normalization (configurable)";
    tokenization: "Word and sentence boundary detection";
    stemming: "Optional stemming for keyword extraction";
  };

  // Content structure
  structurePreservation: {
    paragraphs: "Maintain paragraph boundaries";
    headings: "Extract and preserve heading hierarchy";
    lists: "Preserve list structures";
    tables: "Extract tabular data (future)";
  };

  // Metadata enrichment
  metadataEnrichment: {
    keywords: "Automatic keyword extraction";
    summary: "Generate document summaries (future)";
    entities: "Named entity recognition (future)";
    topics: "Topic classification (future)";
  };
}
```

**Chunking Strategy (Future Enhancement)**:
```typescript
interface DocumentChunking {
  // Chunk size optimization
  chunkStrategy: {
    size: 512;                        // Tokens per chunk
    overlap: 50;                      // Token overlap between chunks
    strategy: "Semantic boundary preservation";
  };

  // Chunking algorithms
  algorithms: {
    fixed: "Fixed-size chunking with overlap";
    semantic: "Chunk at paragraph/section boundaries";
    recursive: "Hierarchical chunking for long documents";
    adaptive: "Dynamic chunk size based on content type";
  };

  // Chunk metadata
  chunkMetadata: {
    parent_document: "Reference to original document";
    chunk_index: "Position within document";
    chunk_type: "Paragraph, section, list, etc.";
    relationships: "Links to adjacent chunks";
  };
}
```

### Vector Generation

**Current Implementation (Phase 1)**:
```typescript
// From apps/api/src/services/qdrant.ts
function generateRandomVector(dimension: number): number[] {
  return Array.from({ length: dimension }, () => Math.random());
}

// Stub implementation benefits
interface StubVectorGeneration {
  development: {
    speed: "Instant vector generation";
    cost: "No API costs during development";
    reliability: "No external dependencies";
  };

  testing: {
    reproducibility: "Consistent with seeded random";
    performance: "Baseline performance measurement";
    isolation: "No network dependencies";
  };

  architecture: {
    interface_validation: "Validates embedding service contracts";
    pipeline_testing: "Tests complete ingestion pipeline";
    scalability_testing: "Load testing without external limits";
  };
}
```

**Production Implementation (Phase 2)**:
```typescript
// Future embedding service integration
interface ProductionEmbedding {
  // Embedding service selection
  services: {
    openai: {
      model: "text-embedding-ada-002";
      dimension: 1536;
      cost: "$0.0001 per 1K tokens";
      quality: "Excellent general-purpose embeddings";
    };

    huggingface: {
      models: ["sentence-transformers/all-MiniLM-L6-v2"];
      dimension: 384;
      cost: "Self-hosted compute only";
      quality: "Good for specialized domains";
    };
  };

  // Batch processing
  batchProcessing: {
    batch_size: 100;                  // Documents per batch
    rate_limiting: "Respect API rate limits";
    retry_logic: "Exponential backoff for failures";
    parallel_processing: "Multiple concurrent batches";
  };

  // Quality assurance
  qualityAssurance: {
    validation: "Validate embedding dimensions";
    normalization: "L2 normalize for cosine similarity";
    monitoring: "Track embedding quality metrics";
  };
}
```

### Metadata Processing

**Metadata Enrichment Pipeline**:
```typescript
interface MetadataProcessing {
  // Core metadata standardization
  standardization: {
    tenant_id: "Normalize tenant identifier format";
    doc_id: "Ensure unique document identifier";
    acl: "Validate and normalize access control entries";
    timestamps: "Add creation and update timestamps";
  };

  // Automatic metadata extraction
  automaticExtraction: {
    language: "Detect document language";
    content_type: "Classify content type (article, manual, etc.)";
    readability: "Calculate readability scores";
    statistics: "Word count, character count, etc.";
  };

  // Enhanced metadata (future)
  enhancedMetadata: {
    keywords: "Extract important keywords and phrases";
    entities: "Named entity recognition and linking";
    topics: "Topic classification and tagging";
    sentiment: "Sentiment analysis for appropriate content";
  };

  // Custom metadata preservation
  customMetadata: {
    preservation: "Maintain client-provided custom fields";
    validation: "Validate custom field formats";
    indexing: "Index frequently queried custom fields";
  };
}
```

## Phase 3: Storage and Indexing

### Vector Storage Implementation

**Qdrant Storage Process**:
```typescript
// From apps/api/src/services/qdrant.ts
export async function ingestDocument(
  qdrantClient: QdrantClient,
  collectionName: string,
  document: Document
): Promise<string> {

  // 1. Generate unique document ID
  const docId = crypto.createHash('sha256')
    .update(document.content)
    .digest('hex');

  // 2. Generate vector embedding
  const vector = generateRandomVector(DOCUMENT_VECTOR_DIMENSION);

  // 3. Prepare point structure
  const point: PointStruct = {
    id: docId,
    vector: vector,
    payload: {
      tenant: document.metadata.tenantId,
      docId: document.metadata.docId,
      acl: document.metadata.acl,
      lang: document.metadata.lang,
      url: document.metadata.url,
      content: document.content,
      // Additional metadata fields
      createdAt: new Date().toISOString(),
      version: document.metadata.version || '1.0'
    }
  };

  // 4. Upsert to Qdrant
  await qdrantClient.upsert(collectionName, {
    wait: true,                       // Synchronous operation
    batch: {
      ids: [point.id],
      vectors: [point.vector],
      payloads: [point.payload]
    }
  });

  return docId;
}
```

**Storage Optimization Strategy**:
```typescript
interface StorageOptimization {
  // Batch operations
  batchOperations: {
    batch_size: 1000;                 // Documents per batch
    concurrency: 5;                   // Concurrent batch operations
    optimization: "Amortize overhead across multiple documents";
  };

  // Deduplication
  deduplication: {
    strategy: "Content-based deduplication";
    hash_function: "SHA-256 of normalized content";
    conflict_resolution: "Update existing document";
  };

  // Index optimization
  indexOptimization: {
    payload_indexes: "Create indexes for frequently filtered fields";
    vector_index: "HNSW index for fast similarity search";
    optimization_schedule: "Automatic optimization during low-traffic periods";
  };
}
```

### Index Management

**Payload Index Strategy**:
```typescript
// From apps/api/src/server.ts - Bootstrap function
interface PayloadIndexStrategy {
  // Critical indexes for performance
  criticalIndexes: {
    tenant: {
      type: "keyword";
      cardinality: "Low (10-1000 tenants)";
      selectivity: "Very high (eliminates 99%+ of data)";
      performance: "O(1) hash lookup";
    };

    acl: {
      type: "keyword array";
      cardinality: "Medium (100-10K unique entries)";
      selectivity: "High (filters within tenant)";
      performance: "O(k) where k = user's group count";
    };
  };

  // Optional indexes for enhanced filtering
  optionalIndexes: {
    lang: {
      type: "keyword";
      cardinality: "Very low (10-50 languages)";
      use_case: "Language-specific search";
    };

    docId: {
      type: "keyword";
      cardinality: "High (unique per document)";
      use_case: "Direct document lookup";
    };
  };

  // Future indexes
  futureIndexes: {
    keywords: {
      type: "keyword array";
      use_case: "Keyword-based filtering";
    };

    content_type: {
      type: "keyword";
      use_case: "Content type filtering";
    };
  };
}
```

## Phase 4: Document Retrieval

### Query Processing

**Retrieval Pipeline**:
```typescript
// From apps/api/src/routes/ask.ts
interface RetrievalPipeline {
  // 1. Query analysis
  queryAnalysis: {
    intent_detection: "Classify query type (future)";
    query_expansion: "Add synonyms and related terms (future)";
    language_detection: "Detect query language";
  };

  // 2. Vector generation
  vectorGeneration: {
    embedding: "Convert query to vector representation";
    normalization: "Normalize for cosine similarity";
    caching: "Cache frequent query vectors";
  };

  // 3. Security context application
  securityContext: {
    tenant_filtering: "Apply tenant boundary";
    acl_filtering: "Apply access control";
    user_context: "Include user and group information";
  };

  // 4. Vector search execution
  vectorSearch: {
    similarity_search: "Find semantically similar documents";
    ranking: "Sort by similarity score";
    filtering: "Apply metadata filters";
  };

  // 5. Post-processing
  postProcessing: {
    rbac_validation: "Double-check access permissions";
    result_formatting: "Format for API response";
    source_attribution: "Include source metadata";
  };
}
```

**Search Result Processing**:
```typescript
interface ResultProcessing {
  // Result ranking
  ranking: {
    primary: "Vector similarity score";
    secondary: "Metadata-based signals (future)";
    normalization: "Score normalization and calibration";
  };

  // Result filtering
  filtering: {
    threshold: "Minimum similarity threshold";
    duplicates: "Remove near-duplicate results";
    diversity: "Ensure result diversity (future)";
  };

  // Result enhancement
  enhancement: {
    snippet_generation: "Generate relevant snippets (future)";
    highlight_generation: "Highlight query terms (future)";
    source_attribution: "Include complete source information";
  };
}
```

## Phase 5: Document Updates and Versioning

### Update Strategies

**Document Update Approaches**:
```typescript
interface UpdateStrategies {
  // Full document replacement
  fullReplacement: {
    strategy: "Replace entire document";
    use_case: "Major content changes";
    implementation: "Delete old, insert new with same docId";
    consistency: "Atomic operation";
  };

  // Versioned updates (future)
  versionedUpdates: {
    strategy: "Maintain multiple versions";
    use_case: "Track document evolution";
    implementation: "Version field in metadata";
    retrieval: "Search latest or specific version";
  };

  // Incremental updates (future)
  incrementalUpdates: {
    strategy: "Update specific fields or sections";
    use_case: "Metadata-only or partial content changes";
    implementation: "Patch-based updates";
    efficiency: "Avoid re-embedding unchanged content";
  };
}
```

**Version Management**:
```typescript
interface VersionManagement {
  // Version tracking
  versionTracking: {
    version_field: "Semantic versioning (1.0, 1.1, 2.0)";
    timestamp: "Update timestamp tracking";
    changelog: "Track what changed between versions";
    author: "Track who made changes";
  };

  // Version retrieval
  versionRetrieval: {
    latest: "Default to latest version";
    specific: "Query specific version by number";
    range: "Query version ranges";
    comparison: "Compare versions (future)";
  };

  // Version cleanup
  versionCleanup: {
    retention: "Keep last N versions";
    archival: "Archive old versions";
    policies: "Tenant-specific retention policies";
  };
}
```

## Phase 6: Document Deletion

### Deletion Strategies

**Multi-Level Deletion**:
```typescript
interface DeletionStrategies {
  // Soft deletion
  softDeletion: {
    implementation: "Mark document as deleted";
    retrieval: "Exclude from search results";
    recovery: "Reversible deletion";
    cleanup: "Periodic hard deletion of soft-deleted items";
  };

  // Hard deletion
  hardDeletion: {
    implementation: "Remove from vector database";
    finality: "Permanent and irreversible";
    use_case: "Privacy compliance, storage cleanup";
    verification: "Confirm deletion completed";
  };

  // Cascade deletion
  cascadeDeletion: {
    scope: "Delete related chunks/versions";
    verification: "Ensure complete removal";
    logging: "Audit trail for deletion operations";
  };
}
```

**Deletion Implementation**:
```typescript
// Future deletion service
interface DeletionService {
  // Soft delete
  async softDelete(docId: string, userContext: UserContext): Promise<boolean> {
    // 1. Verify user has delete permissions
    // 2. Mark document as deleted in metadata
    // 3. Update indexes to exclude from search
    // 4. Log deletion action
  }

  // Hard delete
  async hardDelete(docId: string, userContext: UserContext): Promise<boolean> {
    // 1. Verify user has admin permissions
    // 2. Remove from vector database
    // 3. Clean up any related data
    // 4. Log permanent deletion
  }

  // Bulk deletion
  async bulkDelete(
    filter: DeletionFilter,
    userContext: UserContext
  ): Promise<DeletionResult> {
    // 1. Identify documents matching filter
    // 2. Verify permissions for each document
    // 3. Perform deletion in batches
    // 4. Return detailed results
  }
}
```

## Lifecycle Monitoring and Analytics

### Document Analytics

**Lifecycle Metrics**:
```typescript
interface LifecycleMetrics {
  // Ingestion metrics
  ingestion: {
    throughput: "Documents ingested per hour";
    success_rate: "Successful ingestion percentage";
    error_rate: "Failed ingestion percentage";
    processing_time: "Average processing time per document";
  };

  // Storage metrics
  storage: {
    document_count: "Total documents in system";
    storage_size: "Total storage usage";
    growth_rate: "Storage growth over time";
    duplication_rate: "Percentage of duplicate documents";
  };

  // Retrieval metrics
  retrieval: {
    query_frequency: "Queries per document";
    access_patterns: "Most/least accessed documents";
    relevance_scores: "Average relevance scores";
    result_diversity: "Diversity of retrieved documents";
  };

  // Lifecycle health
  health: {
    stale_documents: "Documents not accessed recently";
    orphaned_data: "Data without proper relationships";
    consistency_checks: "Data integrity verification";
  };
}
```

### Quality Assurance

**Document Quality Monitoring**:
```typescript
interface QualityMonitoring {
  // Content quality
  contentQuality: {
    readability: "Content readability scores";
    completeness: "Content completeness assessment";
    accuracy: "Factual accuracy validation (manual)";
    freshness: "Content freshness tracking";
  };

  // Technical quality
  technicalQuality: {
    embedding_quality: "Embedding generation success rate";
    index_consistency: "Index-data consistency checks";
    search_relevance: "Search result relevance monitoring";
    performance_impact: "Document impact on search performance";
  };

  // User engagement
  userEngagement: {
    click_through: "CTR on document results";
    dwell_time: "Time spent reading documents";
    user_feedback: "Explicit relevance feedback";
    task_completion: "Query resolution success rate";
  };
}
```

## Error Handling and Recovery

### Failure Recovery Strategies

**Resilience Patterns**:
```typescript
interface FailureRecovery {
  // Ingestion failures
  ingestionFailures: {
    retry_logic: "Exponential backoff with jitter";
    dead_letter_queue: "Failed documents for manual review";
    partial_success: "Handle batch partial failures";
    notification: "Alert on persistent failures";
  };

  // Processing failures
  processingFailures: {
    fallback_embedding: "Use fallback if primary embedding fails";
    content_extraction: "Graceful degradation for format issues";
    validation_errors: "Detailed error reporting";
    recovery_procedures: "Manual intervention procedures";
  };

  // Storage failures
  storageFailures: {
    transaction_rollback: "Rollback on storage failures";
    consistency_repair: "Repair inconsistent state";
    backup_restoration: "Restore from backups";
    data_verification: "Verify data integrity after recovery";
  };
}
```

**Data Consistency Guarantees**:
```typescript
interface ConsistencyGuarantees {
  // ACID properties
  atomicity: "All-or-nothing document operations";
  consistency: "Data integrity constraints maintained";
  isolation: "Concurrent operations don't interfere";
  durability: "Committed changes survive failures";

  // Eventually consistent reads
  eventualConsistency: {
    timeline: "New documents available within seconds";
    verification: "Health checks verify consistency";
    repair: "Automatic consistency repair procedures";
  };
}
```

---

**Next**: Learn about [Multi-Tenancy](multi-tenancy.md) design and implementation patterns for secure tenant isolation.