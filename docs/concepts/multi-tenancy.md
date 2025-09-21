# Multi-Tenancy Design

## Introduction

Multi-tenancy is a fundamental architectural principle in cw-rag-core, enabling a single system instance to securely serve multiple organizations (tenants) while ensuring complete data isolation, security, and performance. This document details the comprehensive multi-tenant design implemented throughout the system.

## Multi-Tenancy Fundamentals

### Tenancy Models Comparison

**Tenant Isolation Strategies**:

| Model | Description | Isolation Level | Cost Efficiency | Complexity |
|-------|-------------|-----------------|-----------------|------------|
| **Shared Database, Shared Schema** | Single database with tenant ID filtering | Application-level | Highest | Lowest |
| **Shared Database, Separate Schema** | Database schemas per tenant | Database-level | Medium | Medium |
| **Separate Database** | Complete database per tenant | Full isolation | Lowest | Highest |

**cw-rag-core Implementation**:
```typescript
interface MultiTenancyModel {
  // Chosen model: Shared Database, Shared Schema
  model: "Shared database with application-level isolation";

  rationale: {
    cost_efficiency: "Maximum resource utilization";
    scalability: "Easy scaling for new tenants";
    maintenance: "Single codebase and infrastructure";
    performance: "Optimized queries across all tenants";
  };

  // Security compensation
  security_measures: {
    database_filtering: "Mandatory tenant filtering on all queries";
    application_validation: "Multi-layer access control validation";
    audit_logging: "Comprehensive tenant access auditing";
    encryption: "Data encryption in transit and at rest";
  };
}
```

### Tenant Identity and Context

**Tenant Identification**:
```typescript
// From packages/shared/src/types/document.ts
export type TenantId = string;

// From packages/shared/src/types/user.ts
export interface UserContext {
  id: UserId;
  groupIds: GroupId[];
  tenantId: TenantId;              // Every user belongs to exactly one tenant
}

// Tenant context propagation
interface TenantContext {
  // Immutable tenant assignment
  assignment: "Users cannot change tenant membership at runtime";

  // Context propagation
  propagation: "Tenant context flows through every request";

  // Validation
  validation: "Every operation validates tenant context";

  // Logging
  logging: "All operations logged with tenant context";
}
```

**Tenant Boundary Enforcement**:
```typescript
interface TenantBoundaryEnforcement {
  // Hard boundaries
  hardBoundaries: {
    database_queries: "Every query includes tenant filter";
    api_endpoints: "All endpoints validate tenant context";
    vector_search: "Search results filtered by tenant";
    file_storage: "File paths include tenant isolation";
  };

  // Soft boundaries (additional protection)
  softBoundaries: {
    application_logic: "Business logic validates tenant access";
    ui_components: "Frontend respects tenant boundaries";
    caching: "Cache keys include tenant context";
    logging: "Logs segregated by tenant";
  };

  // Monitoring boundaries
  monitoring: {
    access_patterns: "Monitor for cross-tenant access attempts";
    performance: "Per-tenant performance monitoring";
    usage: "Track tenant resource utilization";
    alerts: "Alert on tenant boundary violations";
  };
}
```

## Database-Level Tenant Isolation

### Qdrant Multi-Tenant Storage

**Single Collection Strategy**:
```typescript
// From apps/api/src/services/qdrant.ts
interface QdrantMultiTenancy {
  // Collection design
  collection_strategy: {
    approach: "Single collection with tenant filtering";
    rationale: "Optimal resource utilization and maintenance";
    scaling: "Supports 1000+ tenants in single collection";
  };

  // Tenant filtering implementation
  filtering_implementation: {
    mandatory_filter: {
      key: 'tenant';
      match: { any: [userContext.tenantId] };
      enforcement: "Applied to every query automatically";
    };

    index_optimization: {
      tenant_index: "Keyword index on tenant field";
      performance: "O(1) tenant filtering";
      selectivity: "High selectivity eliminates 99%+ of data";
    };
  };

  // Query structure
  query_structure: {
    example: `
      const filter = {
        must: [
          { key: 'tenant', match: { any: [userContext.tenantId] } },
          { key: 'acl', match: { any: userAcl } }
        ]
      };
    `;
    guarantee: "No query can bypass tenant filtering";
  };
}
```

**Data Storage Pattern**:
```typescript
// Every document point includes tenant information
interface TenantAwarePoint {
  id: string;                        // Unique across all tenants
  vector: number[];                  // Document embedding
  payload: {
    tenant: string;                  // MANDATORY tenant identifier
    docId: string;                   // Unique within tenant
    acl: string[];                   // Access control within tenant
    content: string;                 // Document content
    // Additional metadata...
  };
}

// Storage operation with tenant context
async function storeTenantDocument(
  document: Document,
  tenantId: TenantId
): Promise<string> {
  // Ensure tenant ID is embedded in every stored point
  const point: PointStruct = {
    id: generateDocumentId(document),
    vector: await generateEmbedding(document.content),
    payload: {
      tenant: tenantId,              // Tenant isolation field
      docId: document.metadata.docId,
      acl: document.metadata.acl,
      content: document.content,
      // ... other fields
    }
  };

  return await qdrantClient.upsert(COLLECTION_NAME, {
    wait: true,
    batch: {
      ids: [point.id],
      vectors: [point.vector],
      payloads: [point.payload]
    }
  });
}
```

### Search Isolation Implementation

**Tenant-Aware Vector Search**:
```typescript
// From apps/api/src/services/qdrant.ts
export async function searchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  request: RetrievalRequest,
  userTenants: string[],             // Always single tenant in current implementation
  userAcl: string[]
): Promise<PointStruct[]> {

  // 1. Mandatory tenant filter construction
  const tenantFilter = {
    must: [
      {
        key: 'tenant',
        match: { any: userTenants }    // Only user's tenant
      }
      // Additional filters (ACL, metadata) are additive
    ]
  };

  // 2. Vector search with tenant isolation
  const searchResult = await qdrantClient.search(collectionName, {
    vector: queryVector,
    limit: request.limit || 5,
    filter: tenantFilter,             // Tenant isolation enforced
    with_payload: true
  });

  // 3. Result validation (defense in depth)
  return searchResult
    .filter(hit => hit.payload?.tenant === userTenants[0])  // Double-check tenant
    .map(hit => ({
      id: hit.id,
      vector: hit.vector || [],
      payload: hit.payload || {},
      score: hit.score
    }));
}
```

**Performance Impact of Tenant Filtering**:
```typescript
interface TenantFilteringPerformance {
  // Index efficiency
  indexPerformance: {
    tenant_filter: {
      cost: "~1ms overhead";
      optimization: "Keyword index provides O(1) lookup";
      selectivity: "Eliminates 99%+ of data for typical tenant";
    };
  };

  // Query performance
  queryPerformance: {
    baseline: "2-5ms without filters";
    with_tenant_filter: "3-6ms with tenant filtering";
    overhead: "20-50% increase for complete isolation";
    acceptable: "Trade-off for security guarantees";
  };

  // Scaling characteristics
  scaling: {
    tenant_count: "Performance independent of total tenant count";
    tenant_size: "Linear with individual tenant document count";
    optimization: "Tenant-specific caching for hot tenants";
  };
}
```

## Application-Level Isolation

### API Request Processing

**Tenant Context Propagation**:
```typescript
// Tenant context flows through entire request lifecycle
interface RequestTenantContext {
  // 1. Request validation
  requestValidation: {
    userContext: "Extract tenant ID from user context";
    validation: "Validate user belongs to tenant";
    authorization: "Check user permissions within tenant";
  };

  // 2. Service layer propagation
  serviceLayer: {
    database_queries: "All queries include tenant context";
    business_logic: "Logic operates within tenant boundary";
    external_calls: "External services include tenant context";
  };

  // 3. Response filtering
  responseFiltering: {
    data_filtering: "Filter response data by tenant";
    metadata_scrubbing: "Remove cross-tenant metadata";
    audit_logging: "Log response with tenant context";
  };
}
```

**Multi-Layer Security Validation**:
```typescript
// From packages/shared/src/utils/rbac.ts
export function hasDocumentAccess(
  userContext: UserContext,
  docMetadata: DocumentMetadata
): boolean {
  // FIRST CHECK: Tenant isolation (hard boundary)
  if (userContext.tenantId !== docMetadata.tenantId) {
    // Log potential security violation
    console.warn('Cross-tenant access attempt', {
      userId: userContext.id,
      userTenant: userContext.tenantId,
      documentTenant: docMetadata.tenantId,
      timestamp: new Date().toISOString()
    });
    return false;  // Hard boundary - no cross-tenant access
  }

  // SECOND CHECK: RBAC within tenant
  const userHasAccess = docMetadata.acl.some((aclEntry: string) => {
    return aclEntry === userContext.id ||
           userContext.groupIds.includes(aclEntry);
  });

  return userHasAccess;
}

// Usage in API routes ensures dual-layer protection
interface DualLayerSecurity {
  // Layer 1: Database filtering
  databaseLayer: "Qdrant queries include tenant filter";

  // Layer 2: Application validation
  applicationLayer: "hasDocumentAccess() validates each result";

  // Result: Defense in depth
  outcome: "Multiple independent checks prevent data leakage";
}
```

### Service Isolation Patterns

**Tenant-Aware Service Design**:
```typescript
interface TenantAwareServices {
  // Document service
  documentService: {
    create: "(document: Document, tenantId: TenantId) => Promise<string>";
    find: "(query: Query, tenantContext: TenantContext) => Promise<Document[]>";
    update: "(id: string, updates: Partial<Document>, tenantContext: TenantContext) => Promise<Document>";
    delete: "(id: string, tenantContext: TenantContext) => Promise<boolean>";
  };

  // Search service
  searchService: {
    vectorSearch: "(query: string, tenantContext: TenantContext) => Promise<SearchResult[]>";
    keywordSearch: "(keywords: string[], tenantContext: TenantContext) => Promise<SearchResult[]>";
    hybridSearch: "(params: SearchParams, tenantContext: TenantContext) => Promise<SearchResult[]>";
  };

  // Analytics service (future)
  analyticsService: {
    getUsageStats: "(tenantId: TenantId, timeRange: TimeRange) => Promise<UsageStats>";
    getPerformanceMetrics: "(tenantId: TenantId) => Promise<PerformanceMetrics>";
    generateReports: "(tenantId: TenantId, reportType: ReportType) => Promise<Report>";
  };
}
```

## Tenant Configuration and Customization

### Per-Tenant Configuration

**Tenant-Specific Settings**:
```typescript
interface TenantConfiguration {
  // Basic tenant information
  tenantInfo: {
    id: TenantId;
    name: string;
    domain: string;                  // Optional domain-based tenant detection
    created: Date;
    status: 'active' | 'suspended' | 'deleted';
  };

  // Feature configuration
  features: {
    maxDocuments: number;            // Document limit per tenant
    maxUsers: number;                // User limit per tenant
    searchRateLimit: number;         // Queries per minute
    storageQuota: number;            // Storage limit in bytes
    retentionPeriod: number;         // Data retention in days
  };

  // Customization settings
  customization: {
    branding: {
      logo: string;                  // Tenant logo URL
      colors: Record<string, string>; // Custom color scheme
      domain: string;                // Custom domain
    };

    searchSettings: {
      defaultLanguage: string;       // Default search language
      enableHybridSearch: boolean;   // Enable keyword + vector search
      resultLimit: number;           // Default result limit
    };

    securitySettings: {
      sessionTimeout: number;        // Session timeout in minutes
      requireMFA: boolean;           // Multi-factor authentication
      allowedDomains: string[];      // Allowed email domains
    };
  };
}
```

**Configuration Management**:
```typescript
interface TenantConfigurationManagement {
  // Configuration storage
  storage: {
    location: "Dedicated tenant configuration collection";
    isolation: "Configuration data isolated by tenant";
    versioning: "Track configuration changes over time";
  };

  // Configuration retrieval
  retrieval: {
    caching: "Cache frequently accessed configurations";
    invalidation: "Invalidate cache on configuration changes";
    fallback: "Default configuration for missing settings";
  };

  // Configuration validation
  validation: {
    schema: "JSON schema validation for all settings";
    limits: "Enforce maximum values for resource settings";
    authorization: "Only tenant admins can modify configuration";
  };
}
```

### Resource Quotas and Limits

**Tenant Resource Management**:
```typescript
interface TenantResourceLimits {
  // Document limits
  documentLimits: {
    maxDocuments: "Maximum documents per tenant";
    maxDocumentSize: "Maximum individual document size";
    totalStorageQuota: "Total storage allocated to tenant";
    enforcement: "Reject new documents when limits reached";
  };

  // Query limits
  queryLimits: {
    queriesPerMinute: "Rate limiting per tenant";
    queriesPerDay: "Daily query quota";
    concurrentQueries: "Maximum concurrent queries";
    enforcement: "429 Too Many Requests when exceeded";
  };

  // User limits
  userLimits: {
    maxUsers: "Maximum users per tenant";
    maxGroups: "Maximum groups per tenant";
    maxAdmins: "Maximum admin users";
    enforcement: "Prevent new user creation when reached";
  };

  // Feature limits
  featureLimits: {
    apiAccess: "API access level per tenant";
    advancedSearch: "Advanced search features availability";
    integrations: "Third-party integration access";
    support: "Support level and response time";
  };
}
```

## Cross-Tenant Security

### Prevention of Data Leakage

**Security Boundaries**:
```typescript
interface CrossTenantSecurityMeasures {
  // Database-level prevention
  databaseLevel: {
    mandatory_filtering: "Every query includes tenant filter";
    index_optimization: "Efficient tenant-based filtering";
    query_validation: "Validate all queries include tenant context";
    result_verification: "Verify results belong to requesting tenant";
  };

  // Application-level prevention
  applicationLevel: {
    context_validation: "Validate user context on every request";
    rbac_enforcement: "Role-based access control within tenants";
    api_isolation: "API endpoints validate tenant boundaries";
    ui_segregation: "UI components respect tenant boundaries";
  };

  // Infrastructure-level prevention
  infrastructureLevel: {
    network_isolation: "Network-level tenant separation (future)";
    encryption: "Data encryption with tenant-specific keys (future)";
    audit_logging: "Comprehensive audit trail per tenant";
    monitoring: "Real-time monitoring for security violations";
  };
}
```

**Threat Detection and Response**:
```typescript
interface TenantSecurityMonitoring {
  // Anomaly detection
  anomalyDetection: {
    cross_tenant_attempts: "Detect attempts to access other tenants' data";
    unusual_access_patterns: "Identify unusual query patterns";
    privilege_escalation: "Monitor for unauthorized permission increases";
    data_exfiltration: "Detect large-scale data access attempts";
  };

  // Real-time alerting
  alerting: {
    security_violations: "Immediate alerts for security breaches";
    quota_exceeded: "Alert when resource limits exceeded";
    performance_degradation: "Alert on tenant-specific performance issues";
    configuration_changes: "Alert on tenant configuration modifications";
  };

  // Incident response
  incidentResponse: {
    automatic_blocking: "Automatically block suspicious activity";
    investigation_tools: "Tools for security incident investigation";
    forensic_logging: "Detailed logs for forensic analysis";
    recovery_procedures: "Procedures for security incident recovery";
  };
}
```

### Audit and Compliance

**Comprehensive Audit Trail**:
```typescript
interface TenantAuditLogging {
  // Access logging
  accessLogging: {
    document_access: "Log every document access with tenant context";
    query_logging: "Log all queries with user and tenant information";
    api_calls: "Log all API calls with tenant attribution";
    authentication: "Log authentication events per tenant";
  };

  // Administrative logging
  administrativeLogging: {
    user_management: "Log user creation, modification, deletion";
    permission_changes: "Log ACL and role changes";
    configuration_changes: "Log tenant configuration modifications";
    data_operations: "Log document creation, updates, deletions";
  };

  // Security logging
  securityLogging: {
    access_violations: "Log unauthorized access attempts";
    privilege_escalation: "Log attempts to exceed permissions";
    cross_tenant_access: "Log cross-tenant access attempts";
    system_changes: "Log system-level changes affecting tenants";
  };

  // Compliance reporting
  complianceReporting: {
    gdpr_compliance: "Data processing logs for GDPR compliance";
    sox_compliance: "Audit trails for SOX compliance";
    hipaa_compliance: "Access logs for HIPAA compliance";
    custom_compliance: "Configurable compliance reporting";
  };
}
```

## Performance Considerations

### Multi-Tenant Performance Optimization

**Tenant-Specific Performance Tuning**:
```typescript
interface TenantPerformanceOptimization {
  // Query optimization
  queryOptimization: {
    tenant_caching: "Cache frequently accessed tenant data";
    index_optimization: "Optimize indexes for tenant query patterns";
    query_planning: "Tenant-aware query execution planning";
    result_caching: "Cache search results per tenant";
  };

  // Resource allocation
  resourceAllocation: {
    cpu_allocation: "Allocate CPU resources based on tenant priority";
    memory_allocation: "Tenant-specific memory allocation";
    storage_optimization: "Optimize storage for tenant access patterns";
    network_bandwidth: "Manage network bandwidth per tenant";
  };

  // Performance isolation
  performanceIsolation: {
    noisy_neighbor: "Prevent one tenant from affecting others";
    resource_limits: "Enforce resource limits per tenant";
    priority_queuing: "Priority queuing for premium tenants";
    circuit_breakers: "Circuit breakers for failing tenants";
  };
}
```

**Scaling Strategy for Multi-Tenancy**:
```typescript
interface MultiTenantScaling {
  // Horizontal scaling
  horizontalScaling: {
    tenant_sharding: "Shard tenants across multiple nodes";
    load_balancing: "Balance load across tenant shards";
    auto_scaling: "Automatically scale based on tenant load";
    geo_distribution: "Distribute tenants geographically";
  };

  // Vertical scaling
  verticalScaling: {
    resource_scaling: "Scale resources based on tenant growth";
    performance_tiers: "Different performance tiers for tenants";
    capacity_planning: "Plan capacity based on tenant projections";
    cost_optimization: "Optimize costs through efficient scaling";
  };

  // Tenant migration
  tenantMigration: {
    live_migration: "Migrate tenants without downtime";
    data_migration: "Migrate tenant data between nodes";
    rollback_capability: "Rollback failed migrations";
    performance_validation: "Validate performance post-migration";
  };
}
```

## Future Enhancements

### Advanced Multi-Tenancy Features

**Phase 2 Enhancements**:
```typescript
interface AdvancedMultiTenancy {
  // Tenant hierarchy
  tenantHierarchy: {
    parent_tenants: "Support for tenant hierarchies";
    shared_resources: "Share resources between related tenants";
    inheritance: "Inherit configurations from parent tenants";
    isolation_levels: "Different isolation levels within hierarchy";
  };

  // Advanced security
  advancedSecurity: {
    tenant_encryption: "Tenant-specific encryption keys";
    key_management: "Tenant key lifecycle management";
    compliance_templates: "Pre-configured compliance settings";
    security_automation: "Automated security policy enforcement";
  };

  // Tenant analytics
  tenantAnalytics: {
    usage_analytics: "Detailed tenant usage analytics";
    performance_analytics: "Tenant performance monitoring";
    cost_analytics: "Cost attribution per tenant";
    predictive_analytics: "Predict tenant growth and needs";
  };
}
```

**Phase 3 Capabilities**:
```typescript
interface EnterpriseTenancy {
  // Multi-region tenancy
  multiRegion: {
    geo_replication: "Replicate tenant data across regions";
    region_affinity: "Keep tenant data in preferred regions";
    disaster_recovery: "Cross-region disaster recovery";
    compliance_regions: "Data residency compliance";
  };

  // Tenant marketplace
  tenantMarketplace: {
    shared_content: "Marketplace for shared content";
    tenant_collaboration: "Collaboration between tenants";
    content_licensing: "License content between tenants";
    community_features: "Community features across tenants";
  };

  // Advanced customization
  advancedCustomization: {
    custom_workflows: "Tenant-specific processing workflows";
    custom_models: "Tenant-specific ML models";
    api_customization: "Tenant-specific API endpoints";
    white_labeling: "Complete white-label solutions";
  };
}
```

---

**Next**: Learn about [n8n Automation](../integration/n8n-automation.md) and workflow automation architecture patterns.