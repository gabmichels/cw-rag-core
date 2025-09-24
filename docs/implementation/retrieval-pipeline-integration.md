# Retrieval Pipeline Integration Guide

## Overview

This document outlines the steps to integrate the section-aware retrieval enhancement into the existing RAG pipeline without disrupting current functionality.

## Integration Strategy

### Phase 1: Infrastructure Setup

#### 1.1 Environment Variables

Add the following environment variables to enable and configure section-aware retrieval:

```bash
# Section-Aware Retrieval Configuration
SECTION_AWARE_SEARCH=true
SECTION_DETECTION_MIN_CONFIDENCE=0.7
SECTION_MAX_PARTS=10
SECTION_COMPLETION_TIMEOUT_MS=2000
SECTION_MAX_CONCURRENT_QUERIES=3
SECTION_MERGE_STRATEGY=interleave
SECTION_CACHE_ENABLED=true
SECTION_CACHE_TIMEOUT_MS=300000

# Performance Tuning
SECTION_MAX_SECTIONS_PER_QUERY=3
SECTION_MAX_ADDITIONAL_CHUNKS=20
SECTION_PRESERVE_ORIGINAL_RANKING=false

# Feature Flags
SECTION_AWARE_SKILL_TABLES=true
SECTION_AWARE_LIST_STRUCTURES=true
SECTION_AWARE_HIERARCHIES=true
```

#### 1.2 Service Dependencies

Update the service dependency injection in the main application:

**File**: `apps/api/src/routes/ask.ts`

```typescript
// Import section-aware services
import {
  SectionAwareHybridSearchService,
  createSectionAwareHybridSearchService,
  SectionDetectionService,
  RelatedChunkFetcherService,
  SectionReconstructionEngine
} from '@cw-rag-core/retrieval';

// Replace existing hybrid search service creation
export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  // ... existing code ...

  // Create section-aware hybrid search service
  const hybridSearchService: SectionAwareHybridSearchService = createSectionAwareHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    options.embeddingService,
    createRerankerService(true),
    options.qdrantClient,
    {
      enabled: process.env.SECTION_AWARE_SEARCH === 'true',
      maxSectionsToComplete: parseInt(process.env.SECTION_MAX_SECTIONS_PER_QUERY || '3'),
      sectionCompletionTimeoutMs: parseInt(process.env.SECTION_COMPLETION_TIMEOUT_MS || '2000'),
      mergeStrategy: (process.env.SECTION_MERGE_STRATEGY || 'interleave') as any,
      preserveOriginalRanking: process.env.SECTION_PRESERVE_ORIGINAL_RANKING === 'true',
      minTriggerConfidence: parseFloat(process.env.SECTION_DETECTION_MIN_CONFIDENCE || '0.7')
    }
  );

  // ... rest of existing code remains unchanged ...
}
```

### Phase 2: Pipeline Modifications

#### 2.1 Guarded Retrieval Service Updates

**File**: `packages/retrieval/src/services/guarded-retrieval.ts`

```typescript
// Update interface to support section-aware results
export interface GuardedRetrievalResult {
  /** Whether the query is answerable */
  isAnswerable: boolean;
  /** Retrieval results (if answerable) */
  results?: HybridSearchResult[];
  /** IDK response (if not answerable) */
  idkResponse?: IdkResponse;
  /** Guardrail decision details */
  guardrailDecision: GuardrailDecision;
  /** Search performance metrics */
  metrics: SearchPerformanceMetrics & {
    guardrailDuration: number;
    sectionCompletionMetrics?: {
      sectionsDetected: number;
      sectionsCompleted: number;
      sectionsReconstructed: number;
      totalAdditionalChunks: number;
      completionDuration: number;
      timeoutOccurred: boolean;
    };
  };
  /** Reconstructed sections (if any) */
  reconstructedSections?: ReconstructedSection[];
}
```

#### 2.2 Answer Synthesis Integration

The answer synthesis service automatically benefits from complete sections without modification, but we can add logging to track improvement:

**File**: `apps/api/src/services/answer-synthesis.ts`

```typescript
// Add section-aware context analysis
private analyzeContextCompleteness(documents: HybridSearchResult[]): {
  hasReconstructedSections: boolean;
  sectionCount: number;
  skillTableCompleteness: number;
} {
  const reconstructedSections = documents.filter(doc =>
    doc.searchType === 'section_reconstructed'
  );

  const skillTiers = ['novice', 'apprentice', 'journeyman', 'master', 'grandmaster', 'legendary', 'mythic'];
  const allContent = documents.map(doc => doc.content || '').join(' ').toLowerCase();
  const foundTiers = skillTiers.filter(tier => allContent.includes(tier));

  return {
    hasReconstructedSections: reconstructedSections.length > 0,
    sectionCount: reconstructedSections.length,
    skillTableCompleteness: foundTiers.length / skillTiers.length
  };
}
```

### Phase 3: Response Schema Updates

#### 3.1 API Response Enhancement

Update the response schema in `apps/api/src/routes/ask.ts` to include section completion metrics:

```typescript
// Add to response schema
sectionCompletionMetrics: {
  type: 'object',
  properties: {
    sectionsDetected: { type: 'integer', minimum: 0 },
    sectionsCompleted: { type: 'integer', minimum: 0 },
    sectionsReconstructed: { type: 'integer', minimum: 0 },
    totalAdditionalChunks: { type: 'integer', minimum: 0 },
    completionDuration: { type: 'number', minimum: 0 },
    timeoutOccurred: { type: 'boolean' }
  }
},
reconstructedSections: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      sectionPath: { type: 'string' },
      structureType: { type: 'string' },
      completeness: { type: 'number', minimum: 0, maximum: 1 },
      originalChunkCount: { type: 'integer', minimum: 1 }
    }
  }
}
```

#### 3.2 Retrieved Documents Enhancement

Enhanced document metadata to include section information:

```typescript
// Update RetrievedDocument interface
export interface RetrievedDocument {
  document: Document;
  score: number;
  freshness?: FreshnessInfo;
  searchType?: 'hybrid' | 'vector_only' | 'keyword_only' | 'section_reconstructed';
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  rerankerScore?: number;
  rank?: number;

  // Section-aware enhancements
  sectionInfo?: {
    isReconstructed: boolean;
    sectionPath?: string;
    structureType?: string;
    originalChunkIds?: string[];
    completeness?: number;
  };
}
```

### Phase 4: Configuration Management

#### 4.1 Tenant-Specific Configuration

Allow tenants to configure section-aware behavior:

```typescript
// Update TenantSearchConfig interface
export interface TenantSearchConfig {
  tenantId: string;
  keywordSearchEnabled: boolean;
  defaultVectorWeight: number;
  defaultKeywordWeight: number;
  defaultRrfK: number;
  rerankerEnabled: boolean;
  rerankerConfig?: {
    model: string;
    topK: number;
    scoreThreshold: number;
  };

  // Section-aware configuration
  sectionAwareConfig?: {
    enabled: boolean;
    maxSectionsPerQuery: number;
    minTriggerConfidence: number;
    timeoutMs: number;
    enabledStructureTypes: string[];
    mergeStrategy: 'replace' | 'append' | 'interleave';
  };
}
```

#### 4.2 Query-Level Overrides

Allow per-query control of section completion:

```typescript
// Update HybridSearchRequest interface
export interface HybridSearchRequest {
  query: string;
  limit: number;
  vectorWeight?: number;
  keywordWeight?: number;
  rrfK?: number;
  enableKeywordSearch?: boolean;
  filter?: Record<string, any>;
  tenantId?: string;

  // Section-aware overrides
  sectionAware?: {
    enabled?: boolean;
    maxSections?: number;
    minConfidence?: number;
    structureTypes?: string[];
    forceCompletion?: boolean; // Force completion even for low confidence
  };
}
```

### Phase 5: Monitoring and Observability

#### 5.1 Metrics Collection

Add comprehensive metrics to track section-aware performance:

```typescript
// Metrics to track
interface SectionAwareMetrics {
  // Performance metrics
  avgSectionCompletionDuration: number;
  sectionCompletionSuccessRate: number;
  sectionTimeoutRate: number;
  avgAdditionalChunksPerQuery: number;

  // Quality metrics
  sectionDetectionAccuracy: number;
  skillTableCompletenessRate: number;
  structureReconstructionQuality: number;

  // Usage metrics
  queriesWithSectionCompletion: number;
  mostCompletedStructureTypes: string[];
  tenantAdoptionRate: number;
}
```

#### 5.2 Logging Strategy

Implement structured logging for section-aware operations:

```typescript
// Section-aware logging
console.log('StructuredLog:SectionDetection', {
  queryId,
  tenantId: userContext.tenantId,
  sectionsDetected: detectedSections.length,
  sectionTypes: detectedSections.map(s => s.pattern.structureType),
  topConfidence: Math.max(...detectedSections.map(s => s.confidence)),
  triggerQuery: query.substring(0, 100)
});

console.log('StructuredLog:SectionCompletion', {
  queryId,
  tenantId: userContext.tenantId,
  sectionsCompleted: completedSections,
  additionalChunks: totalAdditionalChunks,
  completionDuration: metrics.completionDuration,
  timeoutOccurred: metrics.timeoutOccurred,
  skillTableDetected: isSkillTableQuery
});
```

### Phase 6: Rollout Strategy

#### 6.1 Feature Flag Implementation

Use progressive rollout with feature flags:

```typescript
// Feature flag service
interface FeatureFlags {
  sectionAwareSearch: {
    enabled: boolean;
    rolloutPercentage: number; // 0-100
    tenantWhitelist: string[];
    tenantBlacklist: string[];
    queryPatterns: string[]; // Regex patterns for specific query types
  };
}

// In ask route handler
const shouldUseSectionAware = await featureFlagService.shouldUseSectionAware(
  userContext.tenantId,
  query,
  request.headers['user-agent']
);
```

#### 6.2 A/B Testing Framework

Implement A/B testing to compare section-aware vs standard retrieval:

```typescript
// A/B testing configuration
interface ABTestConfig {
  testName: 'section_aware_retrieval_v1';
  enabled: boolean;
  trafficSplit: {
    control: 50;    // Standard retrieval
    treatment: 50;  // Section-aware retrieval
  };
  successMetrics: [
    'response_completeness',
    'user_satisfaction',
    'skill_table_accuracy'
  ];
}
```

### Phase 7: Performance Optimization

#### 7.1 Caching Strategy

Implement intelligent caching for section patterns:

```typescript
// Cache configuration
interface SectionCacheConfig {
  sectionPatternCache: {
    enabled: boolean;
    ttlMs: number;
    maxEntries: number;
  };
  relatedChunkCache: {
    enabled: boolean;
    ttlMs: number;
    maxSizeBytes: number;
  };
  reconstructedSectionCache: {
    enabled: boolean;
    ttlMs: number;
    compressionEnabled: boolean;
  };
}
```

#### 7.2 Database Optimization

Optimize database queries for section retrieval:

```sql
-- Index optimization for section paths
CREATE INDEX CONCURRENTLY idx_documents_section_path
ON documents USING gin((payload->>'sectionPath') gin_trgm_ops);

-- Index for tenant + section path queries
CREATE INDEX CONCURRENTLY idx_documents_tenant_section
ON documents ((payload->>'tenantId'), (payload->>'sectionPath'));
```

### Phase 8: Validation and Testing

#### 8.1 Integration Tests

Create comprehensive integration tests:

```typescript
// Test cases
describe('Section-Aware Retrieval Integration', () => {
  test('should complete skill table sections', async () => {
    const query = "Can you show me the Skill Table for Artistry please?";
    const result = await askRoute.handler(createMockRequest(query));

    expect(result.sectionCompletionMetrics.sectionsDetected).toBeGreaterThan(0);
    expect(result.sectionCompletionMetrics.sectionsReconstructed).toBeGreaterThan(0);

    const skillTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];
    const foundTiers = skillTiers.filter(tier => result.answer.includes(tier));
    expect(foundTiers.length).toBe(7); // All tiers should be present
  });

  test('should handle timeout gracefully', async () => {
    // Mock slow section completion
    jest.spyOn(relatedChunkFetcher, 'fetchRelatedChunks')
      .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 5000)));

    const result = await askRoute.handler(createMockRequest("skill table query"));

    expect(result.sectionCompletionMetrics.timeoutOccurred).toBe(true);
    expect(result.answer).toBeDefined(); // Should still return an answer
  });
});
```

#### 8.2 Performance Benchmarks

Establish performance benchmarks:

```typescript
// Performance test targets
interface PerformanceBenchmarks {
  maxLatencyIncrease: 20; // Max 20% increase in response time
  maxAdditionalDbQueries: 5; // Max 5 additional DB queries per request
  maxMemoryIncrease: 30; // Max 30% increase in memory usage
  minSkillTableCompleteness: 95; // Min 95% skill table completeness
}
```

## Migration Checklist

### Pre-Deployment

- [ ] Environment variables configured
- [ ] Feature flags implemented
- [ ] Database indexes created
- [ ] Monitoring dashboards set up
- [ ] A/B testing framework configured
- [ ] Integration tests passing
- [ ] Performance benchmarks established

### Deployment

- [ ] Deploy with section-aware search disabled
- [ ] Enable for 1% of traffic
- [ ] Monitor metrics for 24 hours
- [ ] Gradually increase to 10%, 25%, 50%, 100%
- [ ] Monitor skill table query completeness
- [ ] Validate no regression in standard queries

### Post-Deployment

- [ ] Validate skill table completeness improvement
- [ ] Monitor performance impact
- [ ] Collect user feedback
- [ ] Analyze A/B test results
- [ ] Document lessons learned
- [ ] Plan next iteration improvements

## Rollback Plan

If issues are detected:

1. **Immediate**: Set `SECTION_AWARE_SEARCH=false`
2. **Traffic Reduction**: Reduce feature flag percentage
3. **Tenant Isolation**: Add problematic tenants to blacklist
4. **Database**: Rollback any schema changes if needed
5. **Monitoring**: Verify metrics return to baseline

## Success Criteria

The integration is considered successful when:

1. **Functional**: 95% of skill table queries return all 7 tiers
2. **Performance**: <20% increase in average response time
3. **Reliability**: <1% additional error rate
4. **User Experience**: Improved response completeness metrics
5. **Adoption**: Successful rollout to 100% of traffic

This integration strategy ensures a smooth transition to section-aware retrieval while maintaining system reliability and performance.