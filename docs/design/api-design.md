# API Design Patterns

## Introduction

The cw-rag-core API follows RESTful principles combined with domain-driven design patterns to create a consistent, predictable, and maintainable interface for RAG operations. The API design emphasizes type safety, clear contracts, and security-first principles.

## API Architecture Philosophy

### Core Design Principles

**1. Contract-First Design**:
```typescript
interface ContractFirstApproach {
  // JSON Schema defines contract
  schema: {
    request: AskRequestSchema;
    response: AskResponseSchema;
    validation: "Runtime validation with Fastify";
  };

  // TypeScript types match schemas
  types: {
    source: "@cw-rag-core/shared";
    consistency: "Compile-time + runtime validation";
    generation: "FromSchema<T> ensures type-schema alignment";
  };

  // Documentation drives implementation
  documentation: {
    format: "OpenAPI-compatible schemas";
    tooling: "Auto-generated from schemas";
  };
}
```

**2. Security-First Design**:
```typescript
interface SecurityFirstPrinciples {
  // Every request includes security context
  securityContext: {
    required: UserContext;
    validation: "Compile-time + runtime";
    enforcement: "Database-level + application-level";
  };

  // Input validation on all endpoints
  inputValidation: {
    strategy: "JSON Schema validation";
    sanitization: "Automatic type coercion";
    rejection: "400 Bad Request with details";
  };

  // Error response sanitization
  errorHandling: {
    publicErrors: "User-safe error messages";
    internalLogging: "Full error details for debugging";
    noLeakage: "No sensitive data in responses";
  };
}
```

**3. Domain-Driven Endpoints**:
```typescript
interface DomainDrivenAPI {
  // Endpoints match business operations
  businessOperations: {
    ask: "Query documents and get answers";
    ingest: "Add new documents to knowledge base";
    health: "System health and readiness";
  };

  // URLs reflect resource hierarchy
  resourceHierarchy: {
    documents: "/documents/{id}";
    ingestion: "/ingest/{type}";
    queries: "/ask";
  };

  // HTTP methods match operations
  httpSemantics: {
    GET: "Retrieve data (health, readiness)";
    POST: "Create or process (ingest, ask)";
    PUT: "Update documents (future)";
    DELETE: "Remove documents (future)";
  };
}
```

## Endpoint Design Patterns

### Query Endpoint: `/ask`

**Purpose**: Process natural language queries and return relevant documents with generated answers.

**Request Contract**:
```typescript
// From packages/shared/src/types/api.ts
interface AskRequest {
  query: string;                    // Natural language query
  userContext: UserContext;         // Security and tenant context
  k?: number;                       // Optional result limit (default: 5)
  filter?: Record<string, any>;     // Optional metadata filters
}

// JSON Schema for runtime validation
const AskRequestSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 1000,
      description: "Natural language query"
    },
    userContext: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        groupIds: {
          type: "array",
          items: { type: "string" },
          maxItems: 50
        },
        tenantId: { type: "string", minLength: 1 }
      },
      required: ["id", "groupIds", "tenantId"],
      additionalProperties: false
    },
    k: {
      type: "number",
      minimum: 1,
      maximum: 50,
      default: 5
    },
    filter: {
      type: "object",
      description: "Additional metadata filters"
    }
  },
  required: ["query", "userContext"],
  additionalProperties: false
} as const;
```

**Response Contract**:
```typescript
interface AskResponse {
  answer: string;                   // Generated answer (Phase 1: stubbed)
  retrievedDocuments: RetrievedDocument[];
  queryId: string;                  // Unique identifier for this query
}

interface RetrievedDocument {
  document: Document;               // Full document with metadata
  score: number;                    // Similarity score (0-1)
}

// Response schema with strict structure
const AskResponseSchema = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "Generated answer based on retrieved documents"
    },
    retrievedDocuments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          document: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              metadata: {
                type: "object",
                properties: {
                  tenantId: { type: "string" },
                  docId: { type: "string" },
                  acl: { type: "array", items: { type: "string" } },
                  // ... other metadata properties
                }
              }
            },
            required: ["id", "content", "metadata"]
          },
          score: {
            type: "number",
            minimum: 0,
            maximum: 1
          }
        },
        required: ["document", "score"]
      }
    },
    queryId: { type: "string" }
  },
  required: ["answer", "retrievedDocuments", "queryId"],
  additionalProperties: false
} as const;
```

**Implementation Pattern**:
```typescript
// From apps/api/src/routes/ask.ts
export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  fastify.post('/ask', {
    // Schema-driven validation
    schema: {
      body: AskRequestSchema,
      response: { 200: AskResponseSchema }
    },

    // Type-safe handler
    handler: async (request: AskRouteRequest, reply: FastifyReply) => {
      // 1. Extract validated input
      const { query, userContext, k = 5, filter } = request.body;

      // 2. Business logic with security enforcement
      const searchResults = await searchDocuments(
        options.qdrantClient,
        options.collectionName,
        { query, userContext, k, filter },
        [userContext.tenantId],              // Tenant isolation
        [userContext.id, ...userContext.groupIds] // ACL context
      );

      // 3. Post-processing security validation
      const filteredResults = searchResults
        .filter(doc => hasDocumentAccess(userContext, doc.document.metadata));

      // 4. Response assembly
      const response: AskResponse = {
        answer: generateAnswer(query, filteredResults), // Phase 1: stubbed
        retrievedDocuments: filteredResults,
        queryId: `qid-${Date.now()}-${crypto.randomUUID()}`
      };

      return reply.send(response);
    }
  });
}
```

### Ingestion Endpoint: `/ingest/normalize`

**Purpose**: Accept documents from various sources and normalize them for vector storage.

**Request Contract**:
```typescript
interface IngestDocumentRequest {
  documents: Array<Omit<Document, 'id'>>;  // Documents without system IDs
}

// Flexible document input
interface DocumentInput {
  content: string;                  // Document text content
  metadata: {
    tenantId: TenantId;            // Required: tenant isolation
    docId: string;                 // Required: client document ID
    acl: string[];                 // Required: access control
    url?: string;                  // Optional: source URL
    authors?: string[];            // Optional: document authors
    keywords?: string[];           // Optional: searchable tags
    [key: string]: unknown;        // Extensible metadata
  };
}

const IngestDocumentRequestSchema = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: {
            type: "string",
            minLength: 1,
            maxLength: 100000,  // 100KB text limit
            description: "Document text content"
          },
          metadata: {
            type: "object",
            properties: {
              tenantId: { type: "string", minLength: 1 },
              docId: { type: "string", minLength: 1 },
              acl: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description: "Access control list"
              },
              url: { type: "string", format: "uri" },
              authors: {
                type: "array",
                items: { type: "string" },
                maxItems: 10
              },
              keywords: {
                type: "array",
                items: { type: "string" },
                maxItems: 20
              }
            },
            required: ["tenantId", "docId", "acl"],
            additionalProperties: true  // Allow custom metadata
          }
        },
        required: ["content", "metadata"]
      },
      minItems: 1,
      maxItems: 100  // Batch size limit
    }
  },
  required: ["documents"],
  additionalProperties: false
} as const;
```

**Response Contract**:
```typescript
interface IngestDocumentResponse {
  success: boolean;                         // Overall operation success
  documentIds: string[];                    // Generated system IDs
  failedDocuments?: FailedDocument[];       // Optional: failed ingestions
}

interface FailedDocument {
  document: Omit<Document, 'id'>;          // Original document
  error: string;                           // User-safe error message
}

// Response schema with error handling
const IngestDocumentResponseSchema = {
  type: "object",
  properties: {
    success: {
      type: "boolean",
      description: "True if all documents were successfully ingested"
    },
    documentIds: {
      type: "array",
      items: { type: "string" },
      description: "System-generated IDs for successfully ingested documents"
    },
    failedDocuments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          document: {
            type: "object",
            description: "Original document that failed ingestion"
          },
          error: {
            type: "string",
            description: "User-safe error message"
          }
        },
        required: ["document", "error"]
      },
      description: "Documents that failed ingestion (only present if failures occurred)"
    }
  },
  required: ["success", "documentIds"],
  additionalProperties: false
} as const;
```

### Health and Monitoring Endpoints

**Health Check: `/healthz`**
```typescript
// Simple health check for load balancers
interface HealthResponse {
  status: 'ok' | 'error';
  timestamp?: string;
}

export async function healthzRoute(fastify: FastifyInstance) {
  fastify.get('/healthz', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'] }
          },
          required: ['status']
        }
      }
    },
    handler: async (request, reply) => {
      return reply.send({ status: 'ok' });
    }
  });
}
```

**Readiness Check: `/readyz`**
```typescript
// Comprehensive readiness check including dependencies
interface ReadinessResponse {
  status: 'ok' | 'not ready';
  qdrant: 'connected' | 'not connected' | 'collection not found';
  timestamp: string;
  error?: string;
}

export async function readyzRoute(fastify: FastifyInstance, options: ReadyOptions) {
  fastify.get('/readyz', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'not ready'] },
            qdrant: { type: 'string' },
            timestamp: { type: 'string' },
            error: { type: 'string' }
          },
          required: ['status', 'qdrant', 'timestamp']
        }
      }
    },
    handler: async (request, reply) => {
      const timestamp = new Date().toISOString();

      try {
        // Check Qdrant connectivity and collection existence
        const collections = await options.qdrantClient.getCollections();
        const collectionExists = collections.collections.some(
          c => c.name === options.collectionName
        );

        if (!collectionExists) {
          return reply.send({
            status: 'not ready',
            qdrant: 'collection not found or not bootstrapped',
            timestamp
          });
        }

        return reply.send({
          status: 'ok',
          qdrant: 'connected',
          timestamp
        });
      } catch (error) {
        return reply.send({
          status: 'not ready',
          qdrant: 'not connected',
          timestamp,
          error: (error as Error).message
        });
      }
    }
  });
}
```

## Error Handling Patterns

### Structured Error Responses

**Error Response Schema**:
```typescript
interface APIError {
  error: {
    code: string;                   // Machine-readable error code
    message: string;                // Human-readable message
    details?: Record<string, any>;  // Additional context
    timestamp: string;              // ISO 8601 timestamp
    requestId?: string;             // Request correlation ID
  };
}

// Standard error codes
enum APIErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

**Error Handler Implementation**:
```typescript
// Global error handler for consistent error responses
fastify.setErrorHandler(async (error, request, reply) => {
  const timestamp = new Date().toISOString();
  const requestId = request.id;

  // Log full error details internally
  fastify.log.error({
    error: error.message,
    stack: error.stack,
    requestId,
    url: request.url,
    method: request.method,
    userAgent: request.headers['user-agent']
  });

  // Determine error type and response
  if (error.statusCode === 400) {
    // Validation error
    return reply.status(400).send({
      error: {
        code: APIErrorCode.VALIDATION_ERROR,
        message: 'Invalid request data',
        details: error.validation || undefined,
        timestamp,
        requestId
      }
    });
  }

  if (error.statusCode === 403) {
    // Authorization error
    return reply.status(403).send({
      error: {
        code: APIErrorCode.FORBIDDEN,
        message: 'Access denied',
        timestamp,
        requestId
      }
    });
  }

  // Internal server error (sanitized)
  return reply.status(500).send({
    error: {
      code: APIErrorCode.INTERNAL_ERROR,
      message: 'An internal error occurred',
      timestamp,
      requestId
    }
  });
});
```

### Validation Error Handling

**Request Validation Errors**:
```typescript
// Fastify automatically handles schema validation
// Custom validation error formatting
fastify.setSchemaErrorFormatter((errors, dataVar) => {
  const formattedErrors = errors.map(error => ({
    field: error.instancePath || error.propertyName,
    message: error.message,
    value: error.data,
    constraint: error.params
  }));

  return new Error(`Validation failed: ${formattedErrors.map(e => e.message).join(', ')}`);
});
```

## Request/Response Middleware

### CORS Configuration

**Cross-Origin Resource Sharing**:
```typescript
// CORS setup for web application integration
await fastify.register(cors, {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3001',      // Development web app
      'https://app.example.com',    // Production web app
      // ... other allowed origins
    ];

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
```

### Request Logging

**Structured Request Logging**:
```typescript
// Request/response logging middleware
fastify.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now();

  fastify.log.info({
    requestId: request.id,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip
  }, 'Request started');
});

fastify.addHook('onResponse', async (request, reply) => {
  const duration = Date.now() - request.startTime;

  fastify.log.info({
    requestId: request.id,
    statusCode: reply.statusCode,
    duration,
    contentLength: reply.getHeader('content-length')
  }, 'Request completed');
});
```

## Versioning Strategy

### API Versioning Approach

**Future Versioning Strategy**:
```typescript
interface APIVersioning {
  // URL-based versioning (future)
  urlVersioning: {
    pattern: "/api/v1/ask" | "/api/v2/ask";
    migration: "Gradual deprecation of old versions";
    compatibility: "Maintain v1 while developing v2";
  };

  // Header-based versioning (alternative)
  headerVersioning: {
    header: "API-Version: 1.0";
    defaultVersion: "Latest stable version";
    negotiation: "Content negotiation based versioning";
  };

  // Schema evolution
  schemaEvolution: {
    strategy: "Backwards compatible changes when possible";
    breaking: "New version for breaking changes";
    deprecation: "6-month deprecation notice";
  };
}
```

**Version Compatibility**:
```typescript
// Schema evolution example
const AskRequestSchemaV1 = {
  // Original schema
  properties: {
    query: { type: "string" },
    userContext: { type: "object" }
  }
};

const AskRequestSchemaV2 = {
  // Extended schema (backwards compatible)
  properties: {
    query: { type: "string" },
    userContext: { type: "object" },
    options: {  // New optional field
      type: "object",
      properties: {
        includeMetadata: { type: "boolean" },
        responseFormat: { type: "string", enum: ["standard", "detailed"] }
      }
    }
  }
};
```

## Performance Considerations

### Response Optimization

**Payload Size Management**:
```typescript
interface ResponseOptimization {
  // Pagination for large result sets
  pagination: {
    implementation: "Limit + offset pattern";
    defaultLimit: 5;
    maxLimit: 50;
  };

  // Field selection (future)
  fieldSelection: {
    pattern: "?fields=document.content,score";
    implementation: "GraphQL-style field selection";
  };

  // Compression
  compression: {
    gzip: "Automatic for responses > 1KB";
    brotli: "For modern browsers";
  };
}
```

### Caching Strategy

**HTTP Caching Headers**:
```typescript
// Cache control for different endpoint types
interface CachingStrategy {
  // Static content caching
  health: {
    cacheControl: "no-cache";
    reason: "Real-time health status required";
  };

  // Query result caching (future)
  queryResults: {
    cacheControl: "private, max-age=300";
    reason: "User-specific results, 5-minute cache";
    vary: "Authorization, Content-Type";
  };

  // Document metadata caching (future)
  documentMetadata: {
    cacheControl: "private, max-age=3600";
    reason: "Metadata changes infrequently";
    etag: "Generated from content hash";
  };
}
```

---

**Next**: Learn about [Database Schema](database-schema.md) and Qdrant collection design for vector storage.