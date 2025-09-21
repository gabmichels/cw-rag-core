# Type System Architecture

## Introduction

The cw-rag-core system leverages TypeScript's advanced type system to ensure type safety, improve developer experience, and maintain consistency across all components. The type architecture is designed around domain-driven design principles with a focus on shared contracts and compile-time safety.

## Type System Philosophy

### Core Principles

**1. Type Safety First**:
```typescript
// Strict TypeScript configuration enforces safety
interface TypeSafetyPrinciples {
  strictMode: true;                    // Enable all strict checks
  noImplicitAny: true;                 // Explicit type annotations
  noUncheckedIndexedAccess: true;      // Safe array/object access
  exactOptionalPropertyTypes: true;    // Precise optional properties
}
```

**2. Domain-Driven Types**:
```typescript
// Types reflect business domain concepts
interface DomainDrivenDesign {
  // Business entities
  entities: ["Document", "User", "Tenant"];

  // Value objects
  valueObjects: ["TenantId", "UserId", "Vector"];

  // Domain services
  services: ["EmbeddingService", "VectorDBClient"];

  // Application contracts
  contracts: ["AskRequest", "IngestRequest"];
}
```

**3. Shared Type Contracts**:
```typescript
// Centralized type definitions prevent drift
interface SharedContracts {
  location: "@cw-rag-core/shared";
  purpose: "Single source of truth for types";
  consumers: ["API", "Web", "Retrieval packages"];
}
```

## Type Hierarchy

### Core Domain Types

**Document Entity Types**:
```typescript
// From packages/shared/src/types/document.ts

// Value object for tenant identification
export type TenantId = string;

// Document metadata with security and versioning
export interface DocumentMetadata {
  tenantId: TenantId;          // Tenant isolation
  docId: string;               // Document identifier
  version?: string;            // Document version
  url?: string;                // Source URL
  filepath?: string;           // File system path
  authors?: string[];          // Document authors
  keywords?: string[];         // Searchable keywords
  acl: string[];               // Access control list
  [key: string]: unknown;      // Extensible metadata
}

// Core document entity
export interface Document {
  id: string;                  // Unique system identifier
  content: string;             // Document text content
  metadata: DocumentMetadata;  // Rich metadata
}
```

**User and Security Types**:
```typescript
// From packages/shared/src/types/user.ts

// Type-safe user identification
export type UserId = string;
export type GroupId = string;

// User context for RBAC
export interface UserContext {
  id: UserId;                  // User identifier
  groupIds: GroupId[];         // Group memberships
  tenantId: TenantId;          // Tenant boundary
}
```

**API Contract Types**:
```typescript
// From packages/shared/src/types/api.ts

// Request/response pairs for type-safe APIs
export interface AskRequest {
  query: string;               // Natural language query
  userContext: UserContext;    // Security context
  k?: number;                  // Result limit
  filter?: Record<string, any>; // Additional filters
}

export interface RetrievedDocument {
  document: Document;          // Full document
  score: number;               // Similarity score
}

export interface AskResponse {
  answer: string;              // Generated answer
  retrievedDocuments: RetrievedDocument[];
  queryId: string;             // Unique query identifier
}
```

### Vector and Retrieval Types

**Vector Operation Types**:
```typescript
// From packages/retrieval/src/types/vector.ts

export interface Vector {
  id: string;                  // Vector identifier
  vector: number[];            // Embedding values
  payload?: Record<string, any>; // Associated metadata
  score?: number;              // Similarity score (for results)
}

export interface VectorSearchParams {
  queryVector: number[];       // Query embedding
  limit: number;               // Maximum results
  filter?: Record<string, any>; // Metadata filters
}

export interface VectorSearchResult extends Vector {
  // Inherits Vector properties with score populated
}
```

**Embedding Service Types**:
```typescript
// From packages/retrieval/src/embedding.ts

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: Document): Promise<number[]>;
}

// Model information for embedding services
export interface ModelInfo {
  name: string;
  dimension: number;
  maxTokens: number;
  provider: string;
}
```

**Document Processing Types**:
```typescript
// From packages/retrieval/src/types/ingestion.ts

export interface IngestedDocument {
  document: Document;          // Original document
  vector: number[];            // Generated embedding
}

export interface DocumentIngestionService {
  ingestDocument(document: Document): Promise<IngestedDocument>;
  batchIngest(documents: Document[]): Promise<IngestedDocument[]>;
}
```

## Schema Validation Architecture

### JSON Schema Integration

**Schema Definition Strategy**:
```typescript
// From packages/shared/src/schemas/index.ts

// Compile-time types + runtime validation
export const DocumentMetadataSchema = {
  type: "object",
  properties: {
    tenantId: { type: "string" },
    docId: { type: "string" },
    acl: {
      type: "array",
      items: { type: "string" },
      minItems: 1
    },
    version: { type: "string" },
    url: { type: "string", format: "uri" },
    authors: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["tenantId", "docId", "acl"],
  additionalProperties: true
} as const;

export const AskRequestSchema = {
  type: "object",
  properties: {
    query: { type: "string", minLength: 1 },
    userContext: {
      type: "object",
      properties: {
        id: { type: "string" },
        groupIds: {
          type: "array",
          items: { type: "string" }
        },
        tenantId: { type: "string" }
      },
      required: ["id", "groupIds", "tenantId"]
    },
    k: { type: "number", minimum: 1, maximum: 50 },
    filter: { type: "object" }
  },
  required: ["query", "userContext"]
} as const;
```

**Type-Schema Consistency**:
```typescript
// Ensure types match schemas at compile time
import { FromSchema } from 'json-schema-to-ts';

type AskRequestFromSchema = FromSchema<typeof AskRequestSchema>;

// TypeScript will error if AskRequest doesn't match schema
const typeCheck: AskRequestFromSchema = {} as AskRequest;
```

### Runtime Validation Integration

**Fastify Schema Validation**:
```typescript
// From apps/api/src/routes/ask.ts

import { FromSchema } from 'json-schema-to-ts';
import { AskRequestSchema, AskResponseSchema } from '@cw-rag-core/shared';

type AskRequestBody = FromSchema<typeof AskRequestSchema>;
type AskRouteRequest = FastifyRequest<{ Body: AskRequestBody }>;

export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  fastify.post('/ask', {
    schema: {
      body: AskRequestSchema,        // Runtime validation
      response: {
        200: AskResponseSchema       // Response validation
      }
    },
    handler: async (request: AskRouteRequest, reply: FastifyReply) => {
      // request.body is now type-safe and validated
      const { query, userContext, k, filter } = request.body;
      // ... implementation
    }
  });
}
```

## Generic and Utility Types

### Common Patterns

**Result and Error Handling Types**:
```typescript
// Discriminated union for error handling
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Usage in service operations
interface ServiceResponse<T> {
  operation(): Promise<Result<T, ServiceError>>;
}

// Error types with context
interface ServiceError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}
```

**Pagination and Collection Types**:
```typescript
// Generic pagination wrapper
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

// Collection operations
interface CollectionOperations<T> {
  find(filter: Partial<T>): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}
```

**Configuration and Environment Types**:
```typescript
// Environment configuration with defaults
interface ApiConfiguration {
  port: number;
  qdrantUrl: string;
  qdrantApiKey?: string;
  collectionName: string;
  corsOrigin: string | string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// Type-safe environment variable parsing
function parseConfiguration(): ApiConfiguration {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    qdrantApiKey: process.env.QDRANT_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION || 'docs_v1',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logLevel: (process.env.LOG_LEVEL as any) || 'info'
  };
}
```

## Type Safety Patterns

### Branded Types

**Type-Safe Identifiers**:
```typescript
// Prevent mixing different ID types
declare const TenantIdBrand: unique symbol;
declare const UserIdBrand: unique symbol;
declare const DocumentIdBrand: unique symbol;

export type TenantId = string & { readonly [TenantIdBrand]: true };
export type UserId = string & { readonly [UserIdBrand]: true };
export type DocumentId = string & { readonly [DocumentIdBrand]: true };

// Type-safe constructors
export function createTenantId(value: string): TenantId {
  // Validation logic here
  return value as TenantId;
}

// Compile-time error prevention
function accessDocument(userId: UserId, docId: DocumentId) {
  // This would cause a compile error:
  // accessDocument(docId, userId); // Arguments swapped
}
```

### Discriminated Unions

**Type-Safe State Management**:
```typescript
// Loading states with discriminated unions
type LoadingState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Type-safe state handling
function handleQueryState(state: LoadingState<AskResponse>) {
  switch (state.status) {
    case 'idle':
      return "Enter a query to get started";
    case 'loading':
      return "Searching for relevant documents...";
    case 'success':
      return `Found ${state.data.retrievedDocuments.length} documents`;
    case 'error':
      return `Error: ${state.error}`;
    // TypeScript ensures all cases are handled
  }
}
```

### Conditional and Mapped Types

**Dynamic Type Generation**:
```typescript
// Conditional types for API responses
type ApiResponse<T> = T extends { error: any }
  ? { success: false; error: T['error'] }
  : { success: true; data: T };

// Mapped types for partial updates
type UpdateDocument = Partial<Pick<Document, 'content'>> & {
  metadata: Partial<DocumentMetadata>;
};

// Utility type for making fields optional
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Usage: Make 'k' and 'filter' optional in AskRequest
type AskRequestPartial = Optional<AskRequest, 'k' | 'filter'>;
```

## Cross-Service Type Contracts

### Service Interface Definitions

**Service Boundary Types**:
```typescript
// Vector database service interface
export interface VectorDatabaseService {
  // Collection management
  createCollection(name: string, config: CollectionConfig): Promise<void>;

  // Document operations
  upsertDocuments(
    collection: string,
    documents: IngestedDocument[]
  ): Promise<string[]>;

  // Search operations
  searchSimilar(
    collection: string,
    query: VectorSearchParams,
    userContext: UserContext
  ): Promise<VectorSearchResult[]>;

  // Health operations
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }>;
}
```

**Integration Point Types**:
```typescript
// n8n workflow integration types
export interface WorkflowTrigger {
  webhookUrl: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authentication?: {
    type: 'bearer' | 'basic' | 'api-key';
    credentials: string;
  };
}

export interface WorkflowExecution {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}
```

## Type Documentation and Discovery

### Self-Documenting Types

**JSDoc Integration**:
```typescript
/**
 * User context for authentication and authorization.
 * Contains all information needed for RBAC decisions.
 *
 * @example
 * ```typescript
 * const context: UserContext = {
 *   id: "user123",
 *   groupIds: ["admin", "engineering"],
 *   tenantId: "acme-corp"
 * };
 * ```
 */
export interface UserContext {
  /** Unique user identifier within the tenant */
  id: UserId;

  /** Groups this user belongs to for role-based access */
  groupIds: GroupId[];

  /** Tenant boundary - user can only access data within this tenant */
  tenantId: TenantId;
}
```

**Type Exports and Discovery**:
```typescript
// packages/shared/src/index.ts - Organized exports
// Core entities
export type {
  Document,
  DocumentMetadata,
  TenantId
} from './types/document.js';

// User and security
export type {
  UserContext,
  UserId,
  GroupId
} from './types/user.js';

// API contracts
export type {
  AskRequest,
  AskResponse,
  IngestDocumentRequest,
  IngestDocumentResponse
} from './types/api.js';

// Utilities
export {
  hasDocumentAccess,
  filterDocumentsByAccess
} from './utils/rbac.js';

// Constants
export {
  DOCUMENT_VECTOR_DIMENSION
} from './constants.js';

// Schemas
export {
  AskRequestSchema,
  AskResponseSchema,
  IngestDocumentRequestSchema
} from './schemas/index.js';
```

## Type Testing and Validation

### Compile-Time Type Tests

**Type Assertion Tests**:
```typescript
// Type compatibility tests
import { AskRequest, UserContext } from '@cw-rag-core/shared';

// Test type compatibility
type _TestUserContextInAskRequest = AskRequest['userContext'] extends UserContext ? true : false;
const _userContextTest: _TestUserContextInAskRequest = true;

// Test required vs optional properties
type _TestOptionalK = AskRequest['k'] extends number | undefined ? true : false;
const _optionalKTest: _TestOptionalK = true;
```

**Schema-Type Consistency Tests**:
```typescript
// Ensure schemas match TypeScript types
import { FromSchema } from 'json-schema-to-ts';
import { AskRequestSchema } from '@cw-rag-core/shared';

type SchemaType = FromSchema<typeof AskRequestSchema>;
type ManualType = AskRequest;

// This will fail compilation if types don't match
const _consistencyTest: SchemaType = {} as ManualType;
const _reverseTest: ManualType = {} as SchemaType;
```

## Future Type System Enhancements

### Advanced Type Features

**Template Literal Types**:
```typescript
// Future: Type-safe URL generation
type APIEndpoint = `/api/${string}`;
type QueryEndpoint = `/ask` | `/search` | `/similar`;
type IngestionEndpoint = `/ingest/${'normalize' | 'raw' | 'bulk'}`;

type ValidEndpoint = QueryEndpoint | IngestionEndpoint;
```

**Recursive and Conditional Types**:
```typescript
// Future: Complex document hierarchy types
type DocumentHierarchy<T = Document> = T & {
  children?: DocumentHierarchy<T>[];
  parent?: DocumentHierarchy<T>;
};

// Future: Dynamic filter types based on metadata
type MetadataFilter<T extends DocumentMetadata> = {
  [K in keyof T]?: T[K] extends string
    ? string | string[]
    : T[K] extends number
    ? number | { min?: number; max?: number }
    : T[K];
};
```

### Type-Driven Development

**Code Generation from Types**:
```typescript
// Future: Generate API clients from types
interface APIClient {
  ask(request: AskRequest): Promise<AskResponse>;
  ingest(request: IngestDocumentRequest): Promise<IngestDocumentResponse>;
}

// Future: Generate database schemas from types
interface DatabaseSchema {
  documents: Document;
  vectors: Vector;
  users: UserContext;
}
```

---

**Next**: Learn about [API Design Patterns](api-design.md) and REST API conventions used throughout the system.