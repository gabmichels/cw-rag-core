# Data Flow Architecture

## Introduction

Understanding data flow is crucial for comprehending how the cw-rag-core system processes information from initial document ingestion through to query responses. This document details the complete journey of data through the system, including transformation points, security checkpoints, and performance considerations.

## Data Flow Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │───▶│   Processing    │───▶│    Storage      │
│                 │    │                 │    │                 │
│ • Files         │    │ • n8n Workflows │    │ • Qdrant Vectors│
│ • APIs          │    │ • Normalization │    │ • Metadata      │
│ • Webhooks      │    │ • Validation    │    │ • Indexes       │
│ • Manual Input  │    │ • Embedding     │    │ • ACL Data      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Queries  │───▶│   Retrieval     │───▶│   Responses     │
│                 │    │                 │    │                 │
│ • Web Interface │    │ • Vector Search │    │ • Ranked Docs   │
│ • API Calls     │    │ • RBAC Filter   │    │ • Generated     │
│ • External Apps │    │ • Ranking       │    │   Answers       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Ingestion Data Flow

### 1. Document Sources and Input

**Data Entry Points**:
- **Manual Web Interface**: Direct document upload through [`page.tsx`](../../apps/web/src/app/page.tsx)
- **n8n Workflows**: Automated document processing via [`ingest-baseline.json`](../../n8n/workflows/ingest-baseline.json)
- **External APIs**: Direct API calls to ingestion endpoints
- **File Systems**: Bulk document processing (future enhancement)

**Input Data Structure**:
```typescript
interface DocumentInput {
  content: string;              // Raw document text
  metadata: {
    tenantId: string;          // Tenant isolation
    docId: string;             // Unique identifier
    acl: string[];             // Access control list
    lang?: string;             // Language code
    url?: string;              // Source URL
    filepath?: string;         // File path
    authors?: string[];        // Document authors
    keywords?: string[];       // Keywords/tags
    [key: string]: unknown;    // Additional metadata
  };
}
```

### 2. n8n Processing Pipeline

**Workflow Stages**:
```
[Input Source]
    → [Manual Trigger / Webhook]
    → [Data Transformation]
    → [Validation & Normalization]
    → [API Call to /ingest/normalize]
    → [Success/Error Handling]
```

**Processing Logic in n8n**:
1. **Data Ingestion**: Receive documents from various sources
2. **Transformation**: Convert to standard format expected by API
3. **Validation**: Ensure required fields are present and valid
4. **Normalization**: Apply consistent formatting and structure
5. **API Integration**: POST to [`/ingest/normalize`](../../apps/api/src/routes/ingestNormalize.ts)
6. **Error Handling**: Retry logic and failure notifications

### 3. API Ingestion Processing

**Request Flow through [`ingestNormalize.ts`](../../apps/api/src/routes/ingestNormalize.ts)**:

```
[HTTP Request]
    → [Schema Validation]
    → [Document Processing Loop]
    → [Vector Generation]
    → [Qdrant Storage]
    → [Response Assembly]
```

**Processing Steps**:
```typescript
interface IngestionFlow {
  // 1. Input Validation
  validateSchema(request: IngestDocumentRequest): void;

  // 2. Document Processing
  processDocuments(documents: Document[]): Promise<ProcessingResult>;

  // 3. Vector Generation (Currently Stubbed)
  generateEmbedding(content: string): Promise<number[]>;

  // 4. Metadata Processing
  enrichMetadata(metadata: DocumentMetadata): DocumentMetadata;

  // 5. Storage Operations
  storeInQdrant(document: Document, vector: number[]): Promise<string>;

  // 6. Response Generation
  assembleResponse(results: IngestionResult[]): IngestDocumentResponse;
}
```

### 4. Vector Generation and Storage

**Current Implementation** (Phase 1 - Stubbed):
```typescript
// From apps/api/src/services/qdrant.ts
function generateRandomVector(dimension: number): number[] {
  return Array.from({ length: dimension }, () => Math.random());
}
```

**Future Implementation** (Phase 2):
```typescript
// Future embedding service integration
interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: Document): Promise<number[]>;
}
```

**Qdrant Storage Flow**:
```typescript
interface QdrantStorageFlow {
  // 1. Point Creation
  createPoint(doc: Document, vector: number[]): PointStruct;

  // 2. Payload Preparation
  preparePayload(metadata: DocumentMetadata): Record<string, any>;

  // 3. Upsert Operation
  upsertToCollection(points: PointStruct[]): Promise<void>;

  // 4. Index Updates
  updatePayloadIndexes(): Promise<void>;
}
```

**Stored Data Structure in Qdrant**:
```json
{
  "id": "sha256-hash-of-content",
  "vector": [0.1, 0.2, ...], // 1536-dimensional vector
  "payload": {
    "tenant": "tenant-uuid",
    "docId": "document-identifier",
    "acl": ["user1", "group1", "public"],
    "lang": "en",
    "url": "https://source.url",
    "content": "Full document text...",
    // Additional metadata fields
  }
}
```

## Query and Retrieval Data Flow

### 1. Query Input and Processing

**Query Entry Points**:
- **Web Interface**: User queries through React UI
- **Direct API**: External applications calling [`/ask`](../../apps/api/src/routes/ask.ts)
- **Integration APIs**: Third-party system integrations

**Query Data Structure**:
```typescript
interface QueryInput {
  query: string;                    // Natural language query
  userContext: {
    id: string;                     // User ID
    groupIds: string[];             // User's groups
    tenantId: string;               // User's tenant
  };
  k?: number;                       // Number of results
  filter?: Record<string, any>;     // Additional filters
}
```

### 2. Query Processing Pipeline

**Flow through [`ask.ts`](../../apps/api/src/routes/ask.ts)**:
```
[Query Request]
    → [Input Validation]
    → [User Context Extraction]
    → [Vector Search Preparation]
    → [Qdrant Search with Filters]
    → [RBAC Post-filtering]
    → [Response Assembly]
```

**Processing Steps**:
```typescript
interface QueryFlow {
  // 1. Request Validation
  validateQuery(request: AskRequest): void;

  // 2. Security Context Setup
  extractUserContext(request: AskRequest): SecurityContext;

  // 3. Query Vector Generation (Currently Stubbed)
  generateQueryVector(query: string): Promise<number[]>;

  // 4. Search Filter Construction
  buildSecurityFilters(context: SecurityContext): QdrantFilter;

  // 5. Vector Search Execution
  executeVectorSearch(vector: number[], filters: QdrantFilter): Promise<ScoredPoint[]>;

  // 6. Access Control Enforcement
  enforceRBAC(results: ScoredPoint[], context: SecurityContext): ScoredPoint[];

  // 7. Response Generation
  assembleQueryResponse(results: ScoredPoint[]): AskResponse;
}
```

### 3. Vector Search and Filtering

**Qdrant Search Configuration**:
```typescript
// From apps/api/src/services/qdrant.ts
const searchParams = {
  vector: queryVector,           // Generated query vector
  limit: request.k || 5,         // Result limit
  filter: {                      // Security filters
    must: [
      {
        key: 'tenant',
        match: { any: [userContext.tenantId] }
      },
      {
        key: 'acl',
        match: { any: [userContext.id, ...userContext.groupIds] }
      }
    ]
  },
  with_payload: true             // Include metadata
};
```

**Search Execution Flow**:
1. **Query Vector Generation**: Convert text query to vector (currently stubbed)
2. **Filter Construction**: Build tenant and ACL filters for security
3. **Vector Search**: Execute similarity search in Qdrant
4. **Result Mapping**: Transform Qdrant results to application format
5. **Post-filtering**: Additional RBAC checks using [`hasDocumentAccess()`](../../packages/shared/src/utils/rbac.ts)

### 4. Response Assembly and Security

**RBAC Enforcement Points**:
```typescript
// Dual-layer security approach
interface SecurityLayers {
  // Layer 1: Database-level filtering (Qdrant)
  preFilterAtDatabase(filters: QdrantFilter): void;

  // Layer 2: Application-level filtering (Post-processing)
  postFilterResults(results: Document[], context: UserContext): Document[];
}
```

**Response Data Structure**:
```typescript
interface QueryResponse {
  answer: string;                 // Generated answer (Phase 1: stubbed)
  retrievedDocuments: Array<{
    document: {
      id: string;
      content: string;
      metadata: DocumentMetadata;
    };
    score: number;                // Similarity score
  }>;
  queryId: string;               // Unique query identifier
}
```

## Data Transformation Points

### 1. Input Normalization

**From External Sources to API Format**:
```
External Format → n8n Transformation → API Schema → Internal Processing
```

**Transformation Examples**:
```typescript
// n8n workflow transformation
{
  "meta": { "tenant": "demo", "docId": "doc1" },
  "text": "content"
}
↓
// API expected format
{
  "documents": [{
    "content": "content",
    "metadata": {
      "tenantId": "demo",
      "docId": "doc1",
      "acl": ["public"]
    }
  }]
}
```

### 2. Storage Format Conversion

**From API to Qdrant Storage**:
```typescript
// API Document format
interface APIDocument {
  content: string;
  metadata: DocumentMetadata;
}

// Qdrant Point format
interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    tenant: string;
    docId: string;
    acl: string[];
    content: string;
    // ... other metadata
  };
}
```

### 3. Response Format Adaptation

**From Qdrant Results to API Response**:
```typescript
// Qdrant ScoredPoint
interface QdrantResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

// API RetrievedDocument
interface APIResult {
  document: {
    id: string;
    content: string;
    metadata: DocumentMetadata;
  };
  score: number;
}
```

## Performance and Caching Considerations

### 1. Vector Search Optimization

**Query Performance Factors**:
- **Index Configuration**: Optimized Qdrant indexes for common query patterns
- **Filter Efficiency**: Database-level filtering reduces network overhead
- **Batch Operations**: Bulk operations for multiple documents
- **Connection Pooling**: Efficient database connection management

### 2. Caching Strategy (Future Enhancement)

**Potential Caching Layers**:
```typescript
interface CachingStrategy {
  // Query result caching
  queryCache: {
    key: string;      // Query + user context hash
    value: AskResponse;
    ttl: number;      // Time to live
  };

  // Vector caching
  vectorCache: {
    key: string;      // Document content hash
    value: number[];  // Generated vector
    ttl: number;
  };

  // Metadata caching
  metadataCache: {
    key: string;      // Document ID
    value: DocumentMetadata;
    ttl: number;
  };
}
```

### 3. Data Flow Monitoring

**Observability Points**:
- Request/response logging at API boundaries
- Vector search performance metrics
- RBAC enforcement audit logs
- Error tracking and alerting
- Document ingestion success/failure rates

## Error Handling and Data Integrity

### 1. Error Propagation

**Error Flow Pattern**:
```
[Component Error] → [Error Logging] → [Error Transformation] → [User-Safe Response]
```

**Error Handling at Each Layer**:
```typescript
interface ErrorHandling {
  // Input validation errors
  ValidationError: {
    source: "request validation";
    action: "return 400 with details";
  };

  // Database errors
  QdrantError: {
    source: "vector database";
    action: "return 500, log details";
  };

  // Access control errors
  RBACError: {
    source: "authorization check";
    action: "return 403, audit log";
  };
}
```

### 2. Data Consistency

**Consistency Guarantees**:
- **Ingestion**: Atomic document storage operations
- **Search**: Eventually consistent read operations
- **RBAC**: Consistent access control enforcement
- **Metadata**: Synchronized metadata across components

### 3. Failure Recovery

**Recovery Strategies**:
```typescript
interface FailureRecovery {
  // Ingestion failures
  ingestionRetry: {
    strategy: "exponential backoff";
    maxRetries: 3;
    fallback: "dead letter queue";
  };

  // Search failures
  searchFallback: {
    strategy: "graceful degradation";
    fallback: "cached results or empty";
  };

  // Database unavailability
  databaseRecovery: {
    strategy: "circuit breaker";
    healthCheck: "periodic retry";
  };
}
```

---

**Next**: Learn about the [Technology Stack](technology-stack.md) and the rationale behind each technology choice.