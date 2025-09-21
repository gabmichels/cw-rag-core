# System Overview

## Introduction

**cw-rag-core** is a production-ready, multi-tenant RAG (Retrieval-Augmented Generation) system designed to provide scalable, secure, and performant information retrieval capabilities. The system combines modern web technologies with advanced vector search to deliver contextual, permission-aware responses to user queries.

## Design Philosophy

### Core Principles

1. **Multi-Tenancy First**: Every component is designed with tenant isolation as a fundamental requirement
2. **Security by Design**: RBAC and access controls are integrated at the data layer, not just the application layer
3. **Scalable Architecture**: Microservices approach with clear separation of concerns
4. **Developer Experience**: Strongly-typed interfaces, comprehensive error handling, and clear APIs
5. **Operational Excellence**: Health checks, monitoring hooks, and containerized deployment

### Architecture Goals

- **Secure Multi-Tenancy**: Complete data isolation between tenants with granular access controls
- **Scalable Performance**: Handle growing document volumes and concurrent users
- **Extensible Design**: Easy integration of new embedding models, LLMs, and data sources
- **Operational Reliability**: Production-ready monitoring, health checks, and error handling
- **Developer Productivity**: Clear APIs, type safety, and comprehensive documentation

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Users                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     Web Layer                                   │
│  ┌─────────────────┐                                           │
│  │   Next.js Web   │  • React-based UI                         │
│  │   Application   │  • TailwindCSS styling                    │
│  │    (:3001)      │  • Client-side state management           │
│  └─────────────────┘                                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP/REST
┌─────────────────────────▼───────────────────────────────────────┐
│                    API Layer                                    │
│  ┌─────────────────┐                                           │
│  │   Fastify API   │  • High-performance REST API              │
│  │   Server        │  • Request validation & error handling    │
│  │   (:3000)       │  • RBAC enforcement                       │
│  └─────────────────┘                                           │
└─────────┬───────────────────────────────────┬───────────────────┘
          │                                   │
          │ gRPC                              │ HTTP
          ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│  Vector Storage │                 │   Workflow      │
│                 │                 │   Automation    │
│  ┌───────────┐  │                 │  ┌───────────┐  │
│  │  Qdrant   │  │                 │  │    n8n    │  │
│  │ Vector DB │  │                 │  │ Workflows │  │
│  │(:6333/34) │  │                 │  │  (:5678)  │  │
│  └───────────┘  │                 │  └───────────┘  │
└─────────────────┘                 └─────────────────┘
```

## System Components

### 1. Web Application (Frontend)
- **Technology**: Next.js 14 with React 18
- **Purpose**: User interface for RAG interactions
- **Responsibilities**:
  - User authentication and session management
  - Query input and response display
  - Document management interface
  - Real-time interaction with API layer

### 2. API Server (Backend)
- **Technology**: Fastify with TypeScript
- **Purpose**: Core business logic and API gateway
- **Responsibilities**:
  - Request validation and error handling
  - RBAC enforcement and security
  - Vector search orchestration
  - Document ingestion and processing
  - Health monitoring and metrics

### 3. Vector Database
- **Technology**: Qdrant
- **Purpose**: High-performance vector similarity search
- **Responsibilities**:
  - Vector storage and indexing
  - Similarity search operations
  - Metadata filtering and queries
  - Tenant data isolation

### 4. Workflow Automation
- **Technology**: n8n
- **Purpose**: Document processing and automation
- **Responsibilities**:
  - Document ingestion pipelines
  - Data transformation workflows
  - External system integrations
  - Scheduled maintenance tasks

## Data Flow Overview

```
[Document] → [n8n Workflow] → [API Ingestion] → [Vector Embedding] → [Qdrant Storage]
                                     ↓
[User Query] → [Web UI] → [API Endpoint] → [Vector Search] → [RBAC Filter] → [Response]
```

### Ingestion Flow
1. **Document Sources**: Files, APIs, webhooks, manual input
2. **n8n Processing**: Normalization, validation, transformation
3. **API Ingestion**: [`/ingest/normalize`](../../apps/api/src/routes/ingestNormalize.ts) endpoint
4. **Vector Generation**: Document embedding (currently stubbed for Phase 1)
5. **Storage**: Qdrant upsert with metadata and ACL

### Query Flow
1. **User Input**: Query through web interface
2. **API Processing**: [`/ask`](../../apps/api/src/routes/ask.ts) endpoint with user context
3. **Vector Search**: Similarity search in Qdrant with pre-filtering
4. **RBAC Enforcement**: Post-filtering using [`hasDocumentAccess()`](../../packages/shared/src/utils/rbac.ts)
5. **Response Generation**: Structured response with retrieved documents

## Security Architecture

### Multi-Tenant Isolation

**Tenant Boundaries**:
- Every document belongs to exactly one tenant
- Users can only access documents within their tenant
- Vector search includes tenant filtering at the database level

**Access Control Lists (ACL)**:
- Each document has an ACL containing user IDs and group IDs
- Users must match at least one ACL entry to access a document
- ACL evaluation happens both at query time (Qdrant filters) and post-processing

### Security Layers

1. **Network Layer**: Service-to-service communication within Docker network
2. **Application Layer**: Input validation, request authentication
3. **Data Layer**: Tenant filtering and ACL enforcement
4. **Storage Layer**: Qdrant payload indexes for efficient filtering

## Scalability Considerations

### Horizontal Scaling
- **API Layer**: Stateless Fastify servers can be load-balanced
- **Vector Database**: Qdrant supports clustering for large datasets
- **Workflow Engine**: n8n can be scaled with additional worker nodes
- **Web Layer**: Next.js applications are easily containerized and scaled

### Performance Optimization
- **Vector Indexing**: Optimized Qdrant indexes for common query patterns
- **Payload Filtering**: Database-level filtering reduces network overhead
- **Connection Pooling**: Efficient database connection management
- **Caching Strategy**: Ready for Redis integration for frequent queries

## Deployment Architecture

### Container Strategy
- **Microservices**: Each component runs in its own container
- **Service Discovery**: Docker Compose networking for development
- **Health Checks**: Built-in health monitoring for each service
- **Volume Management**: Persistent storage for Qdrant data

### Environment Isolation
- **Development**: Local Docker Compose stack
- **Production**: Kubernetes-ready containerization
- **Configuration**: Environment-based configuration management
- **Secrets**: External secret management integration points

## Extension Points

The architecture provides several extension points for future enhancements:

1. **Embedding Services**: Replace stub embedding with real models (OpenAI, Hugging Face, etc.)
2. **LLM Integration**: Add answer generation capabilities
3. **Authentication**: Integrate with enterprise identity providers
4. **Monitoring**: Add observability stack (Prometheus, Grafana, etc.)
5. **Search Enhancement**: Advanced filtering, faceted search, query expansion
6. **Data Sources**: Additional ingestion connectors and transformations

## Technology Decision Rationale

| Technology | Alternative Considered | Decision Rationale |
|------------|----------------------|-------------------|
| **Fastify** | Express.js, Koa | Higher performance, built-in TypeScript support, comprehensive plugin ecosystem |
| **Qdrant** | Weaviate, Pinecone | Open-source, high performance, excellent metadata filtering, Docker-native |
| **Next.js** | Vanilla React, Remix | Full-stack capabilities, excellent developer experience, production-ready |
| **n8n** | Apache Airflow, Temporal | Visual workflow design, extensive integrations, low-code approach |
| **TypeScript** | JavaScript | Type safety, better developer experience, compile-time error detection |
| **pnpm** | npm, yarn | Efficient disk usage, fast installs, excellent monorepo support |

## Future Architectural Considerations

### Phase 2 Enhancements
- **Real Embeddings**: Integration with production embedding models
- **Answer Generation**: LLM integration for contextual responses
- **Advanced Search**: Query expansion, semantic ranking improvements
- **Performance Monitoring**: Comprehensive observability stack

### Phase 3 Capabilities
- **Multi-Modal Support**: Image, audio, and video document processing
- **Real-Time Collaboration**: Live document sharing and collaboration
- **Advanced Analytics**: Usage patterns, query optimization, content insights
- **Enterprise Integration**: SSO, audit logging, compliance features

---

**Next**: Learn about individual [Component Architecture](components.md) and their specific responsibilities.