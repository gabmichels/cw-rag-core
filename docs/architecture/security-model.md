# Security Model

## Introduction

The cw-rag-core system implements a comprehensive, multi-layered security model designed to ensure data privacy, access control, and tenant isolation in a multi-tenant RAG environment. Security is implemented as a foundational concern, not an afterthought, with defense-in-depth principles applied throughout the architecture.

## Security Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Security Layers                            │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Network   │  │Application  │  │    Data     │            │
│  │  Security   │  │  Security   │  │  Security   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│         │                 │                 │                  │
│         ▼                 ▼                 ▼                  │
│  • Service mesh    • Input validation  • Tenant isolation      │
│  • TLS encryption  • Rate limiting     • ACL enforcement       │
│  • Network policies• CORS handling     • Data encryption       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Identity & Access Management                 │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │    Users    │  │   Groups    │  │   Tenants   │            │
│  │             │  │             │  │             │            │
│  │ • User ID   │  │ • Group ID  │  │ • Tenant ID │            │
│  │ • Context   │  │ • Members   │  │ • Isolation │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-Tenancy Architecture

### Tenant Isolation Strategy

**Complete Data Separation**: Each tenant's data is logically isolated with no cross-tenant access possible.

```typescript
// Core tenant isolation principle
interface TenantBoundary {
  tenantId: TenantId;
  enforceIsolation: true;
  crossTenantAccess: never;
}

// Every document belongs to exactly one tenant
interface Document {
  id: string;
  content: string;
  metadata: {
    tenantId: TenantId;    // Mandatory tenant assignment
    docId: string;
    acl: string[];
    // ... other metadata
  };
}
```

### Tenant-Level Security Enforcement

**Database-Level Filtering**:
```typescript
// From apps/api/src/services/qdrant.ts
const filter = {
  must: [
    {
      key: 'tenant',
      match: {
        any: [userContext.tenantId]  // Only user's tenant
      }
    }
    // Additional ACL filters...
  ]
};
```

**Application-Level Validation**:
```typescript
// From packages/shared/src/utils/rbac.ts
export function hasDocumentAccess(
  userContext: UserContext,
  docMetadata: DocumentMetadata
): boolean {
  // First check: Tenant isolation
  if (userContext.tenantId !== docMetadata.tenantId) {
    return false;  // Hard boundary - no cross-tenant access
  }

  // Second check: ACL within tenant
  return docMetadata.acl.some(aclEntry =>
    aclEntry === userContext.id ||
    userContext.groupIds.includes(aclEntry)
  );
}
```

### Tenant Data Flow

```
[User Request]
    → [Extract Tenant Context]
    → [Database Query with Tenant Filter]
    → [Results within Tenant Boundary]
    → [Additional ACL Filtering]
    → [Response to User]
```

**Tenant Context Propagation**:
```typescript
interface UserContext {
  id: UserId;
  groupIds: GroupId[];
  tenantId: TenantId;      // Propagated through entire request
}

// Context flows through every security decision
function enforceSecurityBoundary(
  request: any,
  userContext: UserContext
): boolean {
  return request.targetTenantId === userContext.tenantId;
}
```

## Role-Based Access Control (RBAC)

### RBAC Model Implementation

**Hierarchical Access Control**:
```
Tenant (Isolation Boundary)
├── Documents
│   ├── ACL: ["user1", "group-admin", "public"]
│   └── ACL: ["user2", "group-dev"]
└── Users
    ├── user1 ∈ ["group-admin", "group-dev"]
    └── user2 ∈ ["group-dev"]
```

**Access Decision Logic**:
```typescript
interface AccessControlMatrix {
  // User-level access
  userAccess: {
    rule: "User ID in document ACL";
    implementation: "aclEntry === userContext.id";
  };

  // Group-level access
  groupAccess: {
    rule: "User's group in document ACL";
    implementation: "userContext.groupIds.includes(aclEntry)";
  };

  // Public access
  publicAccess: {
    rule: "'public' in document ACL";
    implementation: "docMetadata.acl.includes('public')";
  };
}
```

### ACL Design Patterns

**Flexible ACL Structure**:
```typescript
// Document metadata ACL examples
interface ACLExamples {
  // Public document (all tenant users)
  publicDoc: {
    acl: ["public"];
  };

  // User-specific document
  privateDoc: {
    acl: ["user123"];
  };

  // Group-shared document
  teamDoc: {
    acl: ["group-engineering", "group-management"];
  };

  // Mixed access document
  mixedDoc: {
    acl: ["user123", "group-admin", "public"];
  };
}
```

**ACL Inheritance and Composition**:
```typescript
// ACL can contain multiple types of identifiers
type ACLEntry =
  | UserId          // "user123"
  | GroupId         // "group-admin"
  | SpecialAccess;  // "public", "system"

interface DocumentACL {
  acl: ACLEntry[];

  // ACL evaluation precedence:
  // 1. Explicit user ID match
  // 2. User's group membership
  // 3. Special access keywords
}
```

### Permission Levels

**Current Permission Model** (Phase 1):
```typescript
interface PermissionModel {
  read: {
    description: "View document content and metadata";
    enforcement: "ACL membership check";
    scope: "Document-level";
  };

  // Future enhancements
  write?: {
    description: "Modify document content";
    enforcement: "Enhanced ACL with write permissions";
  };

  admin?: {
    description: "Manage document ACL and metadata";
    enforcement: "Admin role in ACL";
  };
}
```

## Security Enforcement Points

### Multi-Layer Security Architecture

**Layer 1: Network Security**
```yaml
# Docker network isolation
services:
  web:
    networks: [frontend]
  api:
    networks: [frontend, backend]
  qdrant:
    networks: [backend]       # No direct external access
  n8n:
    networks: [backend]       # No direct external access
```

**Layer 2: Application Security**
```typescript
// Input validation and sanitization
interface ApplicationSecurity {
  // Request validation
  validateInput(request: unknown): ValidatedRequest;

  // CORS handling
  configureCORS(): CORSConfig;

  // Rate limiting (future)
  enforceRateLimit(user: UserContext): boolean;

  // Error sanitization
  sanitizeError(error: Error): PublicError;
}
```

**Layer 3: Data Security**
```typescript
// Database-level security enforcement
interface DataSecurity {
  // Tenant isolation at query level
  enforceTenatFilter(query: SearchQuery): SecureQuery;

  // ACL pre-filtering
  applyACLFilters(query: SearchQuery, context: UserContext): FilteredQuery;

  // Post-query validation
  validateResults(results: Document[], context: UserContext): Document[];
}
```

### Security Checkpoints

**Request Processing Security Flow**:
```
[HTTP Request]
    → [1. Input Validation]
    → [2. User Context Extraction]
    → [3. Tenant Boundary Check]
    → [4. Database Query with Filters]
    → [5. Result ACL Validation]
    → [6. Response Sanitization]
    → [Secure Response]
```

**Implementation in Ask Endpoint**:
```typescript
// From apps/api/src/routes/ask.ts
export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  fastify.post('/ask', {
    schema: {
      body: AskRequestSchema,        // 1. Input validation
      response: { 200: AskResponseSchema }
    },
    handler: async (request, reply) => {
      const { query, userContext } = request.body;  // 2. Context extraction

      // 3. Tenant boundary enforcement
      const userTenants = [userContext.tenantId];
      const userAcl = [userContext.id, ...userContext.groupIds];

      // 4. Secure database query
      const searchResults = await searchDocuments(
        options.qdrantClient,
        options.collectionName,
        request.body,
        userTenants,    // Tenant filter
        userAcl         // ACL filter
      );

      // 5. Post-processing security validation
      const filteredResults = searchResults
        .filter(doc => hasDocumentAccess(userContext, doc.document.metadata));

      // 6. Secure response assembly
      return reply.send(assembleSecureResponse(filteredResults));
    }
  });
}
```

## Data Protection and Privacy

### Data Encryption

**Encryption in Transit**:
```typescript
interface TransitSecurity {
  // HTTPS for all external communication
  webToAPI: "TLS 1.3";

  // Internal service communication
  apiToQdrant: "gRPC with TLS";
  apiToN8N: "HTTPS";

  // Future: service mesh with mTLS
  serviceMesh: "Mutual TLS authentication";
}
```

**Encryption at Rest**:
```typescript
interface RestSecurity {
  // Qdrant storage encryption
  vectorDatabase: {
    current: "Docker volume encryption (host-dependent)";
    future: "Native Qdrant encryption";
  };

  // Container secrets
  environmentSecrets: {
    current: "Environment variables";
    future: "Kubernetes secrets / HashiCorp Vault";
  };
}
```

### Data Minimization

**Privacy-by-Design Principles**:
```typescript
interface PrivacyDesign {
  // Store only necessary data
  documentStorage: {
    content: "Full text for semantic search";
    metadata: "Minimal required fields only";
    userInfo: "Context only, no persistent user data";
  };

  // Automatic data lifecycle
  dataRetention: {
    current: "Manual management";
    future: "Automatic TTL and archival";
  };

  // Audit logging
  accessLogging: {
    current: "Request/response logging";
    future: "Comprehensive audit trail";
  };
}
```

### PII and Sensitive Data Handling

**Data Classification**:
```typescript
interface DataClassification {
  // Document content classification
  contentTypes: {
    public: "No restrictions";
    internal: "Tenant-only access";
    confidential: "Group-restricted access";
    restricted: "User-specific access";
  };

  // Metadata handling
  metadataProtection: {
    acl: "Security-critical, never logged";
    tenantId: "Security-critical, minimal logging";
    content: "May contain PII, careful logging";
  };
}
```

## Security Monitoring and Auditing

### Audit Trail Design

**Security Event Logging**:
```typescript
interface SecurityAuditLog {
  // Access events
  documentAccess: {
    userId: string;
    tenantId: string;
    documentId: string;
    accessResult: "granted" | "denied";
    timestamp: ISO8601;
    requestContext: RequestMetadata;
  };

  // Authentication events (future)
  authenticationEvents: {
    userId: string;
    authMethod: string;
    result: "success" | "failure";
    timestamp: ISO8601;
    clientInfo: ClientMetadata;
  };

  // Administrative events (future)
  adminEvents: {
    adminUserId: string;
    action: "user_create" | "permission_modify" | "tenant_access";
    targetResource: string;
    timestamp: ISO8601;
  };
}
```

### Security Metrics and Alerting

**Monitoring Strategy**:
```typescript
interface SecurityMonitoring {
  // Real-time alerts
  immediateAlerts: {
    multiTenantAccessAttempt: "Cross-tenant access attempt";
    massDataAccess: "Unusual volume of document access";
    authenticationFailures: "Failed authentication attempts";
  };

  // Periodic reports
  securityReports: {
    accessPatterns: "Weekly access pattern analysis";
    permissionAudit: "Monthly permission review";
    dataUsage: "Tenant data usage patterns";
  };
}
```

### Incident Response

**Security Incident Classification**:
```typescript
interface IncidentResponse {
  // Severity levels
  critical: {
    examples: ["Data breach", "Cross-tenant access"];
    response: "Immediate isolation and investigation";
    escalation: "Security team + management";
  };

  high: {
    examples: ["Permission elevation", "Unusual access patterns"];
    response: "Investigation within 4 hours";
    escalation: "Security team";
  };

  medium: {
    examples: ["Failed authentication bursts", "Rate limit exceeded"];
    response: "Investigation within 24 hours";
    escalation: "Operations team";
  };
}
```

## Security Configuration

### Environment-Based Security

**Development Security**:
```typescript
interface DevelopmentSecurity {
  // Relaxed for development productivity
  cors: { origin: "*" };
  logging: { level: "debug", includeHeaders: true };
  authentication: { mock: true };
  encryption: { selfSignedCerts: true };
}
```

**Production Security**:
```typescript
interface ProductionSecurity {
  // Strict security configuration
  cors: { origin: ["https://trusted-domain.com"] };
  logging: { level: "info", sanitized: true };
  authentication: { required: true, provider: "enterprise-sso" };
  encryption: { validCerts: true, minTLS: "1.3" };
}
```

### Security Headers and Middleware

**HTTP Security Headers**:
```typescript
interface SecurityHeaders {
  // Prevent common attacks
  contentSecurityPolicy: "default-src 'self'";
  strictTransportSecurity: "max-age=31536000; includeSubDomains";
  xFrameOptions: "DENY";
  xContentTypeOptions: "nosniff";
  referrerPolicy: "strict-origin-when-cross-origin";
}
```

## Compliance and Standards

### Security Standards Alignment

**Compliance Framework**:
```typescript
interface ComplianceAlignment {
  // Data protection regulations
  gdpr: {
    dataMinimization: "Store only necessary data";
    rightToErasure: "Document deletion capability";
    dataPortability: "Export user data";
    consentManagement: "ACL-based access control";
  };

  // Industry standards
  iso27001: {
    accessControl: "RBAC with least privilege";
    dataProtection: "Encryption and isolation";
    incidentResponse: "Defined response procedures";
  };

  // Cloud security
  cloudSecurityFramework: {
    identityManagement: "Context-based access";
    dataClassification: "ACL-based classification";
    monitoring: "Comprehensive audit logging";
  };
}
```

### Security Assessment

**Regular Security Reviews**:
```typescript
interface SecurityAssessment {
  // Code security
  staticAnalysis: {
    tools: ["ESLint security rules", "npm audit"];
    frequency: "Every commit";
    scope: "All code changes";
  };

  // Dependency security
  dependencyScanning: {
    tools: ["pnpm audit", "Snyk"];
    frequency: "Weekly";
    scope: "All dependencies";
  };

  // Runtime security
  penetrationTesting: {
    scope: "API endpoints and authentication";
    frequency: "Quarterly";
    coverage: "OWASP Top 10";
  };
}
```

## Future Security Enhancements

### Phase 2 Security Features

**Authentication Integration**:
```typescript
interface AuthenticationEnhancement {
  // Enterprise SSO integration
  samlIntegration: "Enterprise identity provider";
  oidcSupport: "OpenID Connect authentication";
  jwtTokens: "Stateless authentication tokens";
  sessionManagement: "Secure session handling";
}
```

**Advanced Authorization**:
```typescript
interface AuthorizationEnhancement {
  // Fine-grained permissions
  resourcePermissions: "Read/write/admin per document";
  attributeBasedAccess: "Dynamic ACL based on attributes";
  temporalAccess: "Time-limited document access";
  conditionalAccess: "Context-aware permissions";
}
```

### Phase 3 Security Capabilities

**Zero Trust Architecture**:
```typescript
interface ZeroTrustSecurity {
  // Never trust, always verify
  mutualTLS: "All service-to-service communication";
  continuousValidation: "Real-time permission validation";
  microsegmentation: "Network-level isolation";
  privilegedAccessManagement: "Administrative access controls";
}
```

**Advanced Threat Detection**:
```typescript
interface ThreatDetection {
  // ML-based anomaly detection
  behaviorAnalysis: "User access pattern analysis";
  anomalyDetection: "Unusual query patterns";
  threatIntelligence: "Known threat pattern matching";
  automaticResponse: "Automatic threat mitigation";
}
```

---

**Next**: Learn about the [Monorepo Structure](../design/monorepo-structure.md) and how code is organized across packages and applications.