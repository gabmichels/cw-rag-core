# Component Architecture

## Introduction

The cw-rag-core system is built using a microservices architecture with clear separation of concerns. Each component has well-defined responsibilities, interfaces, and boundaries that promote maintainability, scalability, and testability.

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌─────────────────┐                                           │
│  │   Web Client    │  React/Next.js Frontend                   │
│  └─────────────────┘                                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP/REST API
┌─────────────────────────▼───────────────────────────────────────┐
│                      API Gateway                                │
│  ┌─────────────────┐                                           │
│  │  Fastify API    │  Request routing, validation, security    │
│  └─────────────────┘                                           │
└─────────┬─────────────────────────┬─────────────────────────────┘
          │                         │
          │ Service Layer           │ External Integration
          ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│  Core Services  │       │   Automation    │
│                 │       │                 │
│ • Retrieval     │       │ • n8n Workflows │
│ • Ingestion     │       │ • Data Pipeline │
│ • RBAC          │       │ • External APIs │
│ • Vector Ops    │       │                 │
└─────────┬───────┘       └─────────────────┘
          │
          │ Data Layer
          ▼
┌─────────────────┐
│  Vector Storage │
│                 │
│ • Qdrant DB     │
│ • Collections   │
│ • Indexes       │
│ • Metadata      │
└─────────────────┘
```

## Frontend Components

### Web Application (`apps/web/`)

**Technology**: Next.js 14 with React 18, TypeScript, TailwindCSS

**Primary Responsibilities**:
- User interface for RAG interactions
- Client-side state management
- API communication and error handling
- Responsive design and accessibility

**Key Files**:
- [`apps/web/src/app/page.tsx`](../../apps/web/src/app/page.tsx) - Main application interface
- [`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx) - Application shell and providers

**Architecture Patterns**:
- **Server Components**: Leverage Next.js App Router for optimal performance
- **Client Components**: Interactive elements with proper hydration
- **API Integration**: Direct REST calls to backend API
- **Error Boundaries**: Graceful error handling and user feedback

**Responsibilities**:
```typescript
interface WebComponentResponsibilities {
  // User Interface
  renderQueryInterface(): JSX.Element;
  renderDocumentResults(): JSX.Element;
  handleUserInteractions(): void;

  // State Management
  manageApplicationState(): void;
  handleFormValidation(): void;
  cacheUserPreferences(): void;

  // API Communication
  submitQueries(): Promise<AskResponse>;
  ingestDocuments(): Promise<IngestResponse>;
  handleAPIErrors(): void;
}
```

**Design Constraints**:
- No direct database access
- All business logic handled by API layer
- Stateless between page refreshes
- Mobile-responsive design required

## Backend Components

### API Server (`apps/api/`)

**Technology**: Fastify with TypeScript, pino logging, validation schemas

**Primary Responsibilities**:
- HTTP request handling and routing
- Input validation and sanitization
- Business logic orchestration
- Security enforcement and RBAC
- Error handling and logging

**Key Files**:
- [`apps/api/src/server.ts`](../../apps/api/src/server.ts) - Main server configuration and bootstrap
- [`apps/api/src/routes/`](../../apps/api/src/routes/) - API endpoint handlers
- [`apps/api/src/services/`](../../apps/api/src/services/) - Business logic services

**Service Architecture**:
```typescript
interface APIServerResponsibilities {
  // Request Handling
  validateRequests(schema: JSONSchema): void;
  routeRequests(): void;
  handleCORS(): void;

  // Business Logic
  orchestrateVectorSearch(): Promise<SearchResults>;
  enforceRBAC(user: UserContext, documents: Document[]): Document[];
  manageDocumentIngestion(): Promise<IngestionResult>;

  // Infrastructure
  healthChecks(): HealthStatus;
  errorLogging(error: Error): void;
  metricsCollection(): void;
}
```

**Route Handlers**:

#### Health & Readiness
- **[`/healthz`](../../apps/api/src/routes/healthz.ts)**: Basic server health check
- **[`/readyz`](../../apps/api/src/routes/readyz.ts)**: Dependency health including Qdrant connectivity

#### Core Business Logic
- **[`/ask`](../../apps/api/src/routes/ask.ts)**: Query processing and vector search
- **[`/ingest/normalize`](../../apps/api/src/routes/ingestNormalize.ts)**: Document ingestion and storage

**Security Middleware**:
- CORS handling for cross-origin requests
- Input validation using JSON schemas
- Error sanitization to prevent information leakage
- Request logging for audit trails

### Qdrant Service Layer (`apps/api/src/services/qdrant.ts`)

**Primary Responsibilities**:
- Vector database abstraction
- Collection management and bootstrap
- Search query optimization
- Metadata filtering and RBAC pre-filtering

**Key Functions**:
```typescript
interface QdrantServiceResponsibilities {
  // Collection Management
  bootstrapQdrant(): Promise<void>;
  createCollection(name: string, config: CollectionConfig): Promise<void>;
  createPayloadIndexes(): Promise<void>;

  // Document Operations
  ingestDocument(doc: Document): Promise<string>;
  searchDocuments(query: SearchParams): Promise<ScoredPoint[]>;

  // Vector Operations
  generateEmbedding(text: string): Promise<number[]>; // Currently stubbed
  upsertVectors(vectors: Vector[]): Promise<void>;
}
```

**Search Flow**:
1. Query vector generation (currently using random vectors for Phase 1)
2. Qdrant filter construction for tenant and ACL constraints
3. Vector similarity search execution
4. Result transformation and mapping

## Shared Libraries

### Core Types Package (`packages/shared/`)

**Purpose**: Centralized type definitions and shared utilities

**Key Modules**:
- [`types/api.ts`](../../packages/shared/src/types/api.ts) - API request/response interfaces
- [`types/document.ts`](../../packages/shared/src/types/document.ts) - Document and metadata structures
- [`types/user.ts`](../../packages/shared/src/types/user.ts) - User context and identity
- [`utils/rbac.ts`](../../packages/shared/src/utils/rbac.ts) - Access control utilities

**Design Patterns**:
```typescript
// Type-safe API contracts
interface APIContract<TRequest, TResponse> {
  request: TRequest;
  response: TResponse;
  validation: JSONSchema;
}

// Domain entity with metadata
interface DomainEntity {
  id: string;
  metadata: Metadata;
  audit: AuditInfo;
}

// Access control pattern
interface SecuredResource {
  acl: string[];
  tenantId: TenantId;
  checkAccess(context: UserContext): boolean;
}
```

### Retrieval Package (`packages/retrieval/`)

**Purpose**: Vector operations and embedding abstractions

**Key Modules**:
- [`embedding.ts`](../../packages/retrieval/src/embedding.ts) - Embedding service interfaces (stubbed)
- [`qdrant.ts`](../../packages/retrieval/src/qdrant.ts) - Vector database client abstraction
- [`types/vector.ts`](../../packages/retrieval/src/types/vector.ts) - Vector operation types
- [`types/ingestion.ts`](../../packages/retrieval/src/types/ingestion.ts) - Document ingestion types

**Abstraction Layer**:
```typescript
interface RetrievalServiceArchitecture {
  // Embedding Abstraction
  EmbeddingService: {
    embed(text: string): Promise<number[]>;
    embedDocument(doc: Document): Promise<number[]>;
    modelInfo(): ModelInfo;
  };

  // Vector Database Abstraction
  VectorDBClient: {
    upsertVectors(vectors: Vector[]): Promise<void>;
    searchVectors(params: SearchParams): Promise<SearchResult[]>;
    deleteVectors(ids: string[]): Promise<void>;
  };

  // Ingestion Pipeline
  IngestionService: {
    processDocument(doc: Document): Promise<IngestedDocument>;
    batchIngest(docs: Document[]): Promise<IngestionResult>;
  };
}
```

## External Dependencies

### Qdrant Vector Database

**Role**: Persistent vector storage and similarity search engine

**Responsibilities**:
- High-performance vector similarity search
- Metadata storage and filtering
- Collection management and indexing
- Clustering and sharding (future scalability)

**Integration Points**:
- gRPC API for high-performance operations
- HTTP API for management operations
- Payload indexes for efficient metadata filtering
- Collection-based tenant isolation

**Configuration**:
```yaml
# Qdrant Collection Configuration
collections:
  docs_v1:
    vectors:
      size: 1536  # Common embedding dimension
      distance: Cosine
    indexes:
      - field: tenant (keyword)
      - field: docId (keyword)
      - field: acl (keyword)
      - field: lang (keyword)
```

### n8n Workflow Engine

**Role**: Document processing automation and external integrations

**Responsibilities**:
- Document ingestion pipelines
- Data transformation workflows
- External system integrations
- Scheduled maintenance tasks

**Integration Patterns**:
- Webhook endpoints for real-time processing
- HTTP requests to API for document ingestion
- Error handling and retry logic
- Workflow state management

## Component Interactions

### Request Flow Patterns

#### Query Processing Flow
```
[Web Client]
    → POST /ask
[API Server]
    → Input validation
    → User context extraction
[Qdrant Service]
    → Vector search with filters
    → RBAC pre-filtering
[RBAC Utils]
    → Post-processing access check
[API Server]
    → Response assembly
[Web Client]
    → Result presentation
```

#### Document Ingestion Flow
```
[n8n Workflow]
    → Document processing
    → POST /ingest/normalize
[API Server]
    → Validation & normalization
[Qdrant Service]
    → Vector generation (stub)
    → Document storage
[API Server]
    → Response confirmation
[n8n Workflow]
    → Success/error handling
```

### Inter-Component Communication

**Synchronous Communication**:
- Web ↔ API: HTTP/REST with JSON
- API ↔ Qdrant: gRPC for performance-critical operations
- API ↔ n8n: HTTP webhooks for workflow triggers

**Error Propagation**:
- Structured error responses with consistent format
- Error logging at component boundaries
- Graceful degradation for non-critical failures

**Data Consistency**:
- Eventually consistent document updates
- Atomic operations within single components
- Idempotent API operations where possible

## Deployment Boundaries

### Container Architecture
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   web:3001      │  │   api:3000      │  │  qdrant:6333    │
│                 │  │                 │  │                 │
│ • Next.js       │  │ • Fastify       │  │ • Vector DB     │
│ • Static assets │  │ • Business logic│  │ • Persistence   │
│ • Client state  │  │ • Validation    │  │ • Search engine │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                  ┌─────────────────┐
                  │    n8n:5678     │
                  │                 │
                  │ • Workflows     │
                  │ • Automation    │
                  │ • Integration   │
                  └─────────────────┘
```

### Service Dependencies
- **Web** depends on **API** (runtime)
- **API** depends on **Qdrant** (runtime, critical)
- **API** integrates with **n8n** (runtime, optional)
- **n8n** calls **API** (runtime, workflow-driven)

### Scaling Characteristics
- **Web**: Stateless, horizontally scalable
- **API**: Stateless, horizontally scalable
- **Qdrant**: Stateful, vertically scalable (clustering available)
- **n8n**: Stateful workflows, worker scaling available

---

**Next**: Understand how data flows through the system in [Data Flow](data-flow.md).