# Monorepo Structure

## Introduction

The cw-rag-core system uses a monorepo architecture to manage multiple related packages and applications in a single repository. This design promotes code reuse, consistent tooling, and simplified dependency management while maintaining clear boundaries between different system components.

## Repository Architecture

```
cw-rag-core/
├── apps/                           # Applications (deployable services)
│   ├── api/                        # Fastify API server
│   └── web/                        # Next.js web application
├── packages/                       # Shared libraries and utilities
│   ├── shared/                     # Common types and utilities
│   └── retrieval/                  # Vector operations and embedding
├── n8n/                           # Workflow automation
│   └── workflows/                  # n8n workflow definitions
├── ops/                           # Operations and deployment
│   └── compose/                    # Docker Compose configuration
├── docs/                          # Comprehensive documentation
│   ├── architecture/               # System architecture docs
│   ├── design/                     # Code design and patterns
│   ├── concepts/                   # Domain concepts
│   └── integration/                # Integration guides
└── [root configuration files]      # Workspace and tooling config
```

## Design Principles

### 1. Clear Separation of Concerns

**Applications vs. Packages**:
```typescript
interface MonorepoStructure {
  // Applications: Deployable, runnable services
  applications: {
    purpose: "End-user facing services";
    characteristics: ["Deployable", "Runtime dependencies", "Entry points"];
    examples: ["api server", "web application"];
  };

  // Packages: Shared libraries and utilities
  packages: {
    purpose: "Reusable code and business logic";
    characteristics: ["Library code", "Type definitions", "Utilities"];
    examples: ["shared types", "retrieval logic"];
  };
}
```

### 2. Dependency Direction

**Dependency Flow Rules**:
```
Apps ──→ Packages ──→ External Dependencies
 │
 └── ❌ Packages should never depend on Apps
     ❌ Apps should not depend on other Apps
     ✅ Apps can depend on Packages
     ✅ Packages can depend on other Packages (carefully)
```

**Implementation**:
```json
// apps/api/package.json
{
  "dependencies": {
    "@cw-rag-core/shared": "file:../../packages/shared",
    "@cw-rag-core/retrieval": "file:../../packages/retrieval"
  }
}

// packages/shared/package.json - No app dependencies
{
  "dependencies": {
    "zod": "^3.22.4"  // Only external dependencies
  }
}
```

### 3. Workspace Configuration

**pnpm Workspace Setup**:
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'      # All applications
  - 'packages/*'  # All shared packages
```

**Benefits**:
- **Shared Dependencies**: Common packages installed once at root
- **Efficient Linking**: Automatic symlink creation for internal packages
- **Consistent Versions**: Unified dependency management
- **Build Optimization**: Parallel builds and caching

## Application Structure

### API Application (`apps/api/`)

**Purpose**: High-performance REST API server for RAG operations

**Internal Structure**:
```
apps/api/
├── src/
│   ├── server.ts                   # Main server entry point
│   ├── routes/                     # API endpoint handlers
│   │   ├── ask.ts                  # Query processing endpoint
│   │   ├── ingestNormalize.ts      # Document ingestion
│   │   ├── healthz.ts              # Health check
│   │   └── readyz.ts               # Readiness check
│   ├── services/                   # Business logic services
│   │   └── qdrant.ts               # Vector database operations
│   ├── types/                      # API-specific type definitions
│   │   └── stubs/                  # Type stubs for external libraries
│   └── __tests__/                  # Unit and integration tests
├── package.json                    # App-specific dependencies
├── tsconfig.json                   # TypeScript configuration
├── jest.config.cjs                 # Test configuration
└── Dockerfile                      # Container build definition
```

**Design Patterns**:
```typescript
// Route organization pattern
interface RouteStructure {
  // Each route is a Fastify plugin
  routePlugin: {
    path: "/ask";
    method: "POST";
    schema: AskRequestSchema;
    handler: AsyncHandler;
  };

  // Service layer abstraction
  serviceLayer: {
    qdrantService: "Vector database operations";
    validationService: "Request/response validation";
    securityService: "RBAC and tenant isolation";
  };

  // Dependency injection pattern
  dependencyInjection: {
    qdrantClient: "Injected via route options";
    logger: "Fastify built-in logger";
    configuration: "Environment-based config";
  };
}
```

### Web Application (`apps/web/`)

**Purpose**: React-based user interface for RAG interactions

**Internal Structure**:
```
apps/web/
├── src/
│   └── app/                        # Next.js App Router
│       ├── layout.tsx              # Root layout and providers
│       ├── page.tsx                # Main application page
│       └── globals.css             # Global styles and Tailwind
├── public/                         # Static assets
│   └── favicon.ico
├── package.json                    # Frontend dependencies
├── tsconfig.json                   # TypeScript configuration
├── next.config.mjs                 # Next.js configuration
├── tailwind.config.ts              # TailwindCSS configuration
├── postcss.config.js               # PostCSS configuration
└── Dockerfile                      # Container build definition
```

**Architecture Patterns**:
```typescript
// Component organization
interface ComponentStructure {
  // Page-level components (App Router)
  pages: {
    layout: "Global layout with providers";
    page: "Main RAG interface component";
    loading: "Loading states (future)";
    error: "Error boundaries (future)";
  };

  // Shared components (future expansion)
  components: {
    ui: "Reusable UI components";
    forms: "Form components and validation";
    charts: "Data visualization components";
  };

  // Hooks and utilities (future expansion)
  utilities: {
    hooks: "Custom React hooks";
    api: "API client utilities";
    types: "Component-specific types";
  };
}
```

## Package Structure

### Shared Package (`packages/shared/`)

**Purpose**: Common types, utilities, and business logic used across applications

**Internal Structure**:
```
packages/shared/
├── src/
│   ├── index.ts                    # Main export barrel
│   ├── constants.ts                # System-wide constants
│   ├── types/                      # Type definitions
│   │   ├── api.ts                  # API request/response types
│   │   ├── document.ts             # Document and metadata types
│   │   └── user.ts                 # User context types
│   ├── schemas/                    # Validation schemas
│   │   └── index.ts                # JSON Schema definitions
│   └── utils/                      # Shared utilities
│       └── rbac.ts                 # Access control utilities
├── package.json                    # Package configuration
└── tsconfig.json                   # TypeScript configuration
```

**Export Strategy**:
```typescript
// src/index.ts - Barrel export pattern
export * from './types/api.js';
export * from './types/document.js';
export * from './types/user.js';
export * from './schemas/index.js';
export * from './utils/rbac.js';
export * from './constants.js';

// Consumer usage
import {
  AskRequest,
  Document,
  UserContext,
  hasDocumentAccess
} from '@cw-rag-core/shared';
```

**Design Guidelines**:
```typescript
interface SharedPackageDesign {
  // Pure functions only
  utilities: {
    rule: "No side effects or external dependencies";
    example: "hasDocumentAccess(user, doc) => boolean";
  };

  // Type definitions
  types: {
    rule: "Interface definitions only, no implementations";
    example: "interface Document { id: string; content: string; }";
  };

  // Constants
  constants: {
    rule: "Compile-time constants only";
    example: "DOCUMENT_VECTOR_DIMENSION = 1536";
  };
}
```

### Retrieval Package (`packages/retrieval/`)

**Purpose**: Vector operations, embedding abstractions, and search logic

**Internal Structure**:
```
packages/retrieval/
├── src/
│   ├── index.ts                    # Package exports
│   ├── embedding.ts                # Embedding service interfaces
│   ├── qdrant.ts                   # Qdrant client abstractions
│   └── types/                      # Retrieval-specific types
│       ├── vector.ts               # Vector operation types
│       └── ingestion.ts            # Document ingestion types
├── package.json                    # Package dependencies
└── tsconfig.json                   # TypeScript configuration
```

**Abstraction Layers**:
```typescript
// Service abstraction pattern
interface RetrievalAbstractions {
  // Embedding service abstraction
  embeddingService: {
    interface: "EmbeddingService";
    implementations: ["OpenAI", "HuggingFace", "Cohere"];
    currentStub: "EmbeddingServiceStub";
  };

  // Vector database abstraction
  vectorDatabase: {
    interface: "VectorDBClient";
    implementations: ["Qdrant", "Weaviate", "Pinecone"];
    currentImpl: "QdrantClientStub";
  };

  // Document processing abstraction
  documentProcessing: {
    interface: "DocumentIngestionService";
    responsibilities: ["Chunking", "Metadata extraction", "Vector generation"];
  };
}
```

## Workspace Management

### Package Linking and Dependencies

**Internal Package References**:
```json
// Using file: protocol for local packages
{
  "dependencies": {
    "@cw-rag-core/shared": "file:../../packages/shared",
    "@cw-rag-core/retrieval": "file:../../packages/retrieval"
  }
}

// Automatic pnpm workspace linking
{
  "dependencies": {
    "@cw-rag-core/shared": "workspace:*"
  }
}
```

**Dependency Resolution**:
```
pnpm install
├── Analyzes workspace.yaml
├── Creates symlinks for internal packages
├── Installs external dependencies to node_modules
└── Builds dependency graph for build ordering
```

### Build and Development Workflow

**Build Strategy**:
```json
// Root package.json scripts
{
  "scripts": {
    "build": "pnpm -r --filter='./packages/*' build",
    "dev:api": "pnpm --filter='@cw-rag-core/api' dev",
    "dev:web": "pnpm --filter='@cw-rag-core/web' dev",
    "test": "pnpm -r test",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --build --dry"
  }
}
```

**Development Commands**:
```bash
# Install all dependencies
pnpm install

# Build shared packages first
pnpm --filter='./packages/*' build

# Run API in development mode
pnpm --filter='@cw-rag-core/api' dev

# Run web application
pnpm --filter='@cw-rag-core/web' dev

# Run tests across all packages
pnpm -r test
```

### TypeScript Configuration

**Workspace TypeScript Setup**:
```json
// Root tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/retrieval" },
    { "path": "./apps/api" },
    { "path": "./apps/web" }
  ]
}
```

**Package-Specific Configuration**:
```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts"]
}
```

## Code Organization Patterns

### Import/Export Conventions

**Barrel Export Pattern**:
```typescript
// packages/shared/src/index.ts
export * from './types/api.js';
export * from './types/document.js';
export * from './utils/rbac.js';

// Consumer code
import { Document, hasDocumentAccess } from '@cw-rag-core/shared';
```

**Relative vs. Absolute Imports**:
```typescript
// Within same package - relative imports
import { validateInput } from './validation.js';
import { QdrantClient } from '../services/qdrant.js';

// Cross-package - workspace imports
import { Document, UserContext } from '@cw-rag-core/shared';
import { EmbeddingService } from '@cw-rag-core/retrieval';
```

### File Naming Conventions

**Consistent Naming Strategy**:
```
Interfaces:     PascalCase (Document, UserContext)
Classes:        PascalCase (QdrantClient, EmbeddingService)
Functions:      camelCase (hasDocumentAccess, validateRequest)
Constants:      UPPER_SNAKE_CASE (DOCUMENT_VECTOR_DIMENSION)
Files:          kebab-case (api-design.md, user-context.ts)
Directories:    kebab-case (multi-tenancy/, type-system/)
```

### Module Organization

**Feature-Based Organization**:
```typescript
// Group related functionality together
interface FeatureOrganization {
  // Document-related functionality
  documentFeature: {
    types: "Document, DocumentMetadata";
    validation: "document schemas";
    utilities: "document processing functions";
  };

  // User and security functionality
  securityFeature: {
    types: "UserContext, TenantId";
    validation: "security schemas";
    utilities: "RBAC functions";
  };

  // API functionality
  apiFeature: {
    types: "Request/Response interfaces";
    validation: "API schemas";
    utilities: "API utilities";
  };
}
```

## Benefits and Trade-offs

### Benefits of Monorepo Structure

**Code Sharing and Reuse**:
```typescript
interface MonorepoBenefits {
  // Shared types across services
  typeSharing: {
    benefit: "Consistent interfaces";
    example: "Document type used in API, web, and retrieval";
  };

  // Shared utilities
  utilitySharing: {
    benefit: "DRY principle enforcement";
    example: "RBAC logic shared between API and future services";
  };

  // Coordinated changes
  atomicChanges: {
    benefit: "Cross-package changes in single commit";
    example: "API schema change updates types and validation";
  };

  // Consistent tooling
  toolingUniformity: {
    benefit: "Same linting, testing, and build tools";
    example: "ESLint rules applied consistently";
  };
}
```

### Trade-offs and Considerations

**Complexity Management**:
```typescript
interface MonorepoTradeoffs {
  // Increased complexity
  complexity: {
    challenge: "More complex build and dependency management";
    mitigation: "Clear documentation and automated workflows";
  };

  // Tight coupling risk
  coupling: {
    challenge: "Risk of creating unnecessary dependencies";
    mitigation: "Strict dependency direction rules";
  };

  // Build performance
  buildTime: {
    challenge: "Longer build times for large changesets";
    mitigation: "Incremental builds and caching";
  };
}
```

## Future Evolution

### Scaling the Monorepo

**Growth Strategies**:
```typescript
interface MonorepoScaling {
  // Additional packages
  newPackages: {
    planned: ["@cw-rag-core/auth", "@cw-rag-core/monitoring"];
    organization: "Feature-based package creation";
  };

  // Service extraction
  serviceExtraction: {
    candidates: ["Authentication service", "Analytics service"];
    criteria: "Independent deployment requirements";
  };

  // Build optimization
  buildOptimization: {
    strategies: ["Nx integration", "Turborepo adoption", "Custom build tools"];
    goals: "Faster builds and better caching";
  };
}
```

### Package Evolution

**Migration Strategies**:
```typescript
interface PackageEvolution {
  // Package splitting
  splitting: {
    scenario: "Large package becomes unwieldy";
    strategy: "Create focused sub-packages";
    example: "@cw-rag-core/retrieval split into embedding + vector + search";
  };

  // Package promotion
  promotion: {
    scenario: "Package becomes independently useful";
    strategy: "Extract to separate repository";
    example: "RBAC utilities extracted as standalone library";
  };
}
```

---

**Next**: Learn about the [Type System Architecture](type-system.md) and how TypeScript types are organized across the system.