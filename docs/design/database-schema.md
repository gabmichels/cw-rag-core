# Database Schema Design

## Introduction

The cw-rag-core system uses Qdrant as its primary vector database, designed specifically for high-performance similarity search with rich metadata filtering. The database schema is architected to support multi-tenant RAG operations with security, performance, and scalability as core requirements.

## Qdrant Architecture Overview

### Collection Design Philosophy

**Single Collection Strategy**:
```rust
// Collection: docs_v1
{
  "vectors": {
    "size": 1536,           // Standard embedding dimension
    "distance": "Cosine"    // Optimal for text embeddings
  },
  "optimizers_config": {
    "default_segment_number": 0,  // Auto-optimization
    "max_segment_size": 20000,    // Segment size for performance
    "memmap_threshold": 50000,    // Memory mapping threshold
    "indexing_threshold": 10000,  // Full index threshold
    "flush_interval_sec": 30,     // Persistence interval
    "max_optimization_threads": 4 // Parallel optimization
  }
}
```

**Design Rationale**:
- **Single Collection**: Simplifies management while supporting multi-tenancy through filtering
- **Cosine Distance**: Best for normalized text embeddings and semantic similarity
- **1536 Dimensions**: Standard for OpenAI embeddings (future integration)
- **Auto-Optimization**: Qdrant handles segment optimization automatically

### Vector Storage Structure

**Point Structure**:
```typescript
// From apps/api/src/services/qdrant.ts
interface QdrantPoint {
  id: string;                    // SHA256 hash of content
  vector: number[];              // 1536-dimensional embedding
  payload: {
    // Core document content
    content: string;             // Full document text

    // Security and isolation
    tenant: string;              // Tenant ID for isolation
    docId: string;               // Client document identifier
    acl: string[];               // Access control list

    // Metadata for filtering
    lang?: string;               // Language code (ISO 639-1)
    url?: string;                // Source URL
    filepath?: string;           // File system path
    authors?: string[];          // Document authors
    keywords?: string[];         // Searchable tags
    version?: string;            // Document version

    // Timestamps
    createdAt?: string;          // ISO 8601 creation time
    updatedAt?: string;          // ISO 8601 update time

    // Custom metadata (extensible)
    [key: string]: any;          // Additional client metadata
  };
}
```

## Indexing Strategy

### Payload Indexes

**Optimized Indexes for RAG Operations**:
```typescript
// From apps/api/src/server.ts - Bootstrap function
const payloadIndexes = [
  {
    field_name: 'tenant',       // Critical for tenant isolation
    field_schema: 'keyword',    // Exact match indexing
    wait: true                  // Synchronous creation
  },
  {
    field_name: 'docId',        // Document identification
    field_schema: 'keyword',    // Exact match indexing
    wait: true
  },
  {
    field_name: 'acl',          // Access control filtering
    field_schema: 'keyword',    // Array keyword indexing
    wait: true
  },
  {
    field_name: 'lang',         // Language-based filtering
    field_schema: 'keyword',    // ISO language codes
    wait: true
  }
];
```

**Index Performance Characteristics**:

| Index | Purpose | Cardinality | Query Pattern | Performance Impact |
|-------|---------|-------------|---------------|-------------------|
| `tenant` | Tenant isolation | Low (10-1000) | Equality filter | High selectivity |
| `docId` | Document lookup | High (1M+) | Equality filter | Unique lookups |
| `acl` | Access control | Medium (100-10K) | Array contains | Security filtering |
| `lang` | Language filtering | Low (10-50) | Equality filter | Optional filtering |

### Vector Index Configuration

**HNSW (Hierarchical Navigable Small World) Configuration**:
```rust
// Qdrant's default HNSW parameters (optimized for text embeddings)
{
  "hnsw_config": {
    "m": 16,                    // Number of bi-directional links
    "ef_construct": 100,        // Size of dynamic candidate list
    "full_scan_threshold": 10000, // Linear scan threshold
    "max_indexing_threads": 0,  // Auto-detect CPU cores
    "on_disk": false,           // In-memory for performance
    "payload_m": 16             // Payload index optimization
  }
}
```

**Performance Trade-offs**:
```typescript
interface IndexPerformance {
  // Build time vs. query performance
  buildTime: {
    efConstruct: "Higher = slower build, better recall";
    m: "Higher = slower build, better connectivity";
    recommendation: "Default values optimized for text";
  };

  // Memory vs. disk storage
  storage: {
    onDisk: false;              // In-memory for sub-10ms queries
    memoryUsage: "~4GB for 1M documents";
    diskFallback: "Available for large datasets";
  };

  // Query performance
  searchSpeed: {
    efSearch: "Runtime parameter, higher = better recall";
    typical: "2-5ms for 1M vectors";
    scalability: "Logarithmic with dataset size";
  };
}
```

## Security Schema Design

### Tenant Isolation at Database Level

**Tenant Filtering Pattern**:
```typescript
// From apps/api/src/services/qdrant.ts
const tenantFilter = {
  must: [
    {
      key: 'tenant',
      match: {
        any: [userContext.tenantId]  // Only user's tenant
      }
    }
  ]
};

// This filter is applied to EVERY query
const secureSearchParams = {
  vector: queryVector,
  limit: requestLimit,
  filter: tenantFilter,           // Database-level security
  with_payload: true
};
```

**Security Guarantees**:
```typescript
interface DatabaseSecurity {
  // Tenant isolation
  tenantIsolation: {
    enforcement: "Database query level";
    guarantee: "No cross-tenant data leakage";
    performance: "Indexed for O(log n) filtering";
  };

  // Access control
  aclFiltering: {
    enforcement: "Database query + application level";
    granularity: "Document-level permissions";
    flexibility: "User + group-based access";
  };

  // Data visibility
  dataVisibility: {
    principle: "Deny by default";
    filtering: "Pre-filter at database + post-filter at application";
    auditability: "All access logged";
  };
}
```

### ACL Storage and Querying

**ACL Array Structure**:
```typescript
// ACL stored as array of strings in payload
interface ACLStructure {
  // Flexible ACL entries
  aclEntries: [
    "user:john.doe",           // Specific user access
    "group:engineering",       // Group-based access
    "role:admin",              // Role-based access
    "public",                  // Public access within tenant
    "system:automated"         // System access
  ];

  // Query pattern for ACL matching
  aclQuery: {
    key: 'acl',
    match: {
      any: [
        userContext.id,              // Direct user match
        ...userContext.groupIds      // Group membership match
      ]
    }
  };
}
```

**ACL Performance Optimization**:
```typescript
// ACL index design for efficient filtering
interface ACLIndexing {
  // Keyword index on ACL array
  indexType: "keyword array";

  // Query efficiency
  performance: {
    singleUser: "O(1) hash lookup";
    multipleGroups: "O(k) where k = number of user groups";
    scaling: "Linear with user's group count, not total ACL size";
  };

  // Memory efficiency
  storage: {
    deduplication: "Qdrant handles string deduplication";
    compression: "Efficient storage of repeated ACL entries";
  };
}
```

## Data Types and Validation

### Payload Data Types

**Qdrant Payload Schema**:
```typescript
interface QdrantPayloadSchema {
  // Required fields (always present)
  required: {
    content: "string",           // Document text content
    tenant: "string",            // Tenant identifier
    docId: "string",             // Client document ID
    acl: "string[]"              // Access control list
  };

  // Optional metadata
  optional: {
    lang: "string",              // ISO 639-1 language code
    url: "string",               // Valid URL format
    filepath: "string",          // File system path
    authors: "string[]",         // Author names
    keywords: "string[]",        // Searchable keywords
    version: "string",           // Version identifier
    createdAt: "string",         // ISO 8601 timestamp
    updatedAt: "string"          // ISO 8601 timestamp
  };

  // Custom fields (client-defined)
  extensible: {
    [customField: string]: any   // Client-specific metadata
  };
}
```

**Data Validation Strategy**:
```typescript
// Validation at application layer before Qdrant storage
interface PayloadValidation {
  // Required field validation
  requiredFields: {
    content: "Non-empty string, max 100KB";
    tenant: "Valid tenant ID format";
    docId: "Non-empty string, unique within tenant";
    acl: "Non-empty array of valid ACL entries";
  };

  // Format validation
  formatValidation: {
    url: "Valid URI format if present";
    lang: "ISO 639-1 language code if present";
    timestamps: "ISO 8601 format if present";
    authors: "Array of non-empty strings if present";
  };

  // Business rules
  businessRules: {
    aclMinimum: "At least one ACL entry required";
    contentLength: "Between 1 and 100,000 characters";
    metadataSize: "Total payload < 10MB";
  };
}
```

### Vector Data Integrity

**Vector Validation and Normalization**:
```typescript
// From packages/retrieval/src/embedding.ts (future implementation)
interface VectorValidation {
  // Dimension validation
  dimensionCheck: {
    expected: 1536,              // Standard embedding dimension
    validation: "Reject vectors with wrong dimensions";
    error: "INVALID_VECTOR_DIMENSION";
  };

  // Normalization (for cosine similarity)
  normalization: {
    strategy: "L2 normalization for cosine distance";
    implementation: "vector / ||vector||_2";
    benefit: "Consistent similarity scores";
  };

  // Quality checks
  qualityChecks: {
    nanCheck: "Reject vectors containing NaN values";
    infinityCheck: "Reject vectors containing infinity";
    zeroCheck: "Warn on zero vectors (no similarity)";
  };
}
```

## Performance Optimization

### Query Performance Patterns

**Search Optimization Strategy**:
```typescript
interface SearchOptimization {
  // Filter ordering for optimal performance
  filterOptimization: {
    order: ["tenant", "acl", "lang"];  // Most selective first
    rationale: "Tenant filter eliminates most data";
    impact: "10x+ query performance improvement";
  };

  // Pagination and limits
  resultLimiting: {
    defaultLimit: 5,             // Reasonable default
    maxLimit: 50,                // Prevent expensive queries
    pagination: "Offset-based (simple, sufficient for RAG)";
  };

  // Vector search parameters
  vectorOptimization: {
    efSearch: "Runtime configurable (default: 100)";
    balancing: "Recall vs. latency trade-off";
    typical: "ef=100 provides 95%+ recall in <10ms";
  };
}
```

**Memory and Storage Optimization**:
```typescript
interface StorageOptimization {
  // Segment optimization
  segmentation: {
    strategy: "Auto-optimization by Qdrant";
    segmentSize: "20,000 vectors per segment";
    benefit: "Balanced memory usage and search speed";
  };

  // Memory mapping
  memoryMapping: {
    threshold: "50,000 vectors";
    strategy: "Hot data in memory, cold data on disk";
    performance: "Minimal impact for frequently accessed data";
  };

  // Compression
  compression: {
    vectors: "Qdrant internal compression";
    payload: "String deduplication and compression";
    savings: "30-50% storage reduction typical";
  };
}
```

### Scaling Considerations

**Horizontal Scaling Design**:
```typescript
interface ScalingStrategy {
  // Single collection scaling
  verticalScaling: {
    capacity: "10M+ documents on single node";
    memory: "8-16GB RAM for good performance";
    storage: "SSD recommended for optimal I/O";
  };

  // Cluster scaling (future)
  horizontalScaling: {
    sharding: "By tenant ID for natural partitioning";
    replication: "3-replica setup for high availability";
    consistency: "Eventually consistent reads acceptable for RAG";
  };

  // Performance projections
  performanceScaling: {
    searchLatency: "Logarithmic scaling with dataset size";
    throughput: "Linear scaling with CPU cores";
    storage: "Linear growth with document count";
  };
}
```

## Schema Evolution and Migration

### Schema Versioning Strategy

**Backwards Compatible Changes**:
```typescript
interface SchemaEvolution {
  // Adding new optional fields
  additive: {
    newFields: "Add as optional payload fields";
    compatibility: "Existing data remains valid";
    migration: "No migration required";
    example: "Adding 'summary' field to documents";
  };

  // Modifying existing fields
  modification: {
    strategy: "Dual-write pattern during transition";
    process: "Write to old + new format, gradually migrate reads";
    timeline: "3-month transition period";
    example: "Changing 'authors' from string to array";
  };

  // Breaking changes
  breaking: {
    strategy: "New collection version (docs_v2)";
    migration: "Background reprocessing of documents";
    timeline: "6-month parallel operation";
    cutover: "Feature flag controlled switch";
  };
}
```

**Migration Patterns**:
```typescript
// Example migration for schema changes
interface MigrationExample {
  // Phase 1: Dual-write new format
  phase1: {
    writes: "Write to both old and new field formats";
    reads: "Read from old format with fallback to new";
    duration: "1 month";
  };

  // Phase 2: Background migration
  phase2: {
    process: "Async reprocessing of existing documents";
    verification: "Spot checks for data integrity";
    rollback: "Ability to revert if issues found";
    duration: "2 months";
  };

  // Phase 3: Cut over to new format
  phase3: {
    reads: "Switch to new format with old format fallback";
    cleanup: "Remove old format fields after verification";
    monitoring: "Enhanced monitoring during transition";
    duration: "1 month";
  };
}
```

### Collection Management

**Collection Lifecycle Management**:
```typescript
interface CollectionManagement {
  // Bootstrap process
  initialization: {
    creation: "Automatic collection creation if not exists";
    indexing: "Payload indexes created during bootstrap";
    verification: "Health check confirms collection readiness";
  };

  // Backup and recovery
  backupStrategy: {
    frequency: "Daily full backups";
    retention: "30-day backup retention";
    testing: "Monthly restore testing";
    automation: "Automated backup verification";
  };

  // Monitoring and maintenance
  maintenance: {
    optimization: "Automatic segment optimization";
    compaction: "Weekly compaction during low-traffic windows";
    monitoring: "Continuous performance and error monitoring";
    alerting: "Alerts for performance degradation";
  };
}
```

## Integration with Application Layer

### ORM-like Abstractions

**Database Abstraction Layer**:
```typescript
// Future: Higher-level abstractions over Qdrant
interface DocumentRepository {
  // CRUD operations
  create(document: Document): Promise<string>;
  findById(id: string, userContext: UserContext): Promise<Document | null>;
  findByQuery(query: string, userContext: UserContext): Promise<Document[]>;
  update(id: string, updates: Partial<Document>): Promise<Document>;
  delete(id: string): Promise<boolean>;

  // Batch operations
  createBatch(documents: Document[]): Promise<string[]>;
  findByIds(ids: string[], userContext: UserContext): Promise<Document[]>;

  // Search operations
  similaritySearch(
    vector: number[],
    limit: number,
    userContext: UserContext
  ): Promise<ScoredDocument[]>;

  hybridSearch(
    query: string,
    filters: MetadataFilter,
    userContext: UserContext
  ): Promise<ScoredDocument[]>;
}
```

**Query Builder Pattern**:
```typescript
// Type-safe query construction
interface QueryBuilder {
  // Fluent interface for query construction
  where(field: keyof DocumentMetadata, value: any): QueryBuilder;
  whereIn(field: keyof DocumentMetadata, values: any[]): QueryBuilder;
  whereNot(field: keyof DocumentMetadata, value: any): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;

  // Security context application
  withUser(context: UserContext): QueryBuilder;

  // Execution
  execute(): Promise<Document[]>;
  count(): Promise<number>;
  first(): Promise<Document | null>;
}

// Usage example
const documents = await queryBuilder
  .where('lang', 'en')
  .whereIn('keywords', ['technical', 'documentation'])
  .withUser(userContext)
  .limit(10)
  .execute();
```

## Monitoring and Observability

### Database Metrics

**Key Performance Indicators**:
```typescript
interface DatabaseMetrics {
  // Performance metrics
  performance: {
    avgQueryLatency: "P50, P95, P99 query response times";
    throughputQPS: "Queries per second";
    indexUtilization: "Index hit ratio";
    cacheHitRatio: "Memory cache effectiveness";
  };

  // Capacity metrics
  capacity: {
    documentCount: "Total documents in collection";
    storageSize: "Disk usage for vectors + payload";
    memoryUsage: "RAM usage for indexes and cache";
    segmentCount: "Number of optimized segments";
  };

  // Security metrics
  security: {
    tenantIsolationChecks: "Successful tenant filtering";
    aclViolationAttempts: "Blocked access attempts";
    unauthorizedQueries: "Failed authorization counts";
  };
}
```

**Health Monitoring**:
```typescript
// Database health checks
interface HealthMonitoring {
  // Basic connectivity
  connectivity: {
    check: "Can connect to Qdrant cluster";
    frequency: "Every 30 seconds";
    alertThreshold: "3 consecutive failures";
  };

  // Collection health
  collectionHealth: {
    check: "Collection exists and is accessible";
    indexHealth: "All payload indexes operational";
    frequency: "Every 5 minutes";
  };

  // Performance health
  performanceHealth: {
    queryLatency: "P95 latency < 50ms";
    errorRate: "Error rate < 1%";
    throughput: "QPS within expected range";
  };
}
```

---

**Next**: Learn about [RAG Fundamentals](../concepts/rag-fundamentals.md) and how the theoretical concepts are implemented in practice.