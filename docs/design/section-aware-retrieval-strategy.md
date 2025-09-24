# Section-Aware Retrieval Enhancement Strategy

## Overview

This document outlines the comprehensive strategy for implementing section-aware retrieval to solve the problem where structured content (like skill tables) gets chunked and only partially retrieved, resulting in incomplete LLM responses.

## Problem Statement

### Current Issue
- Documents are chunked using `AdaptiveChunker` with `sectionPath` metadata (e.g., `block_9/part_0`)
- Hybrid search returns only highest-scoring individual chunks
- Structured content like skill tables is split across multiple chunks
- LLM receives incomplete information (missing skill tiers: Grandmaster, Legendary, Mythic)

### Expected Outcome
- Complete sections should be retrieved when high-confidence partial matches are found
- All skill tiers (Novice, Apprentice, Journeyman, Master, Grandmaster, Legendary, Mythic) should be available to the LLM
- System should maintain backward compatibility and performance

## Architecture Design

### 1. Section Detection Service

**Purpose**: Identify chunks that belong to structured sections requiring completion

**Key Features**:
- Analyze `sectionPath` patterns in retrieved chunks
- Detect confidence thresholds indicating section membership
- Identify structured content types (tables, lists, hierarchical data)

**Implementation**:
```typescript
interface SectionPattern {
  basePattern: string;     // e.g., "block_9"
  partCount: number;       // Number of parts in section
  structureType: 'table' | 'list' | 'hierarchy' | 'sequence';
  confidence: number;      // Confidence that this is a structured section
}

interface SectionDetectionConfig {
  minConfidenceThreshold: number;    // 0.7 - Only complete high-confidence sections
  maxSectionParts: number;          // 10 - Prevent excessive chunk retrieval
  structurePatterns: string[];      // Regex patterns for structured content
  enabledContentTypes: string[];    // ['table', 'list'] - Types to complete
}
```

### 2. Related Chunk Fetcher

**Purpose**: Retrieve all chunks belonging to the same logical section

**Key Features**:
- Query vector database using `sectionPath` prefix patterns
- Maintain RBAC and tenant isolation
- Preserve original relevance scoring for audit trails

**Implementation**:
```typescript
interface RelatedChunkQuery {
  sectionPath: string;
  tenantId: string;
  userContext: UserContext;
  maxChunks: number;
}

interface RelatedChunkResult {
  chunks: HybridSearchResult[];
  completionConfidence: number;
  sectionMetadata: {
    totalParts: number;
    retrievedParts: number;
    missingParts: string[];
  };
}
```

### 3. Section Reconstruction Engine

**Purpose**: Merge related chunks into coherent sections while preserving structure

**Key Features**:
- Sort chunks by `sectionPath` order
- Merge content preserving formatting and structure
- Calculate combined confidence scores
- Handle incomplete sections gracefully

**Implementation**:
```typescript
interface ReconstructedSection {
  id: string;                    // Combined section ID
  content: string;               // Merged content
  originalChunks: ChunkReference[]; // References to source chunks
  completeness: number;          // 0-1 how complete the section is
  combinedScore: number;         // Weighted average of chunk scores
  sectionMetadata: {
    sectionPath: string;
    structureType: string;
    partCount: number;
    reconstructionMethod: string;
  };
}
```

### 4. Enhanced Hybrid Search Integration

**Purpose**: Integrate section-aware logic into existing pipeline without breaking changes

**Architecture Flow**:
```
1. Standard Hybrid Search (Vector + Keyword + RRF + Reranking)
2. Section Detection Analysis
3. Related Chunk Fetching (if sections detected)
4. Section Reconstruction
5. Result Merging & De-duplication
6. Guardrail Evaluation (with complete sections)
7. LLM Context Formation
```

## Implementation Strategy

### Phase 1: Core Infrastructure
1. **Section Detection Service** - Identify section patterns
2. **Related Chunk Fetcher** - Query and retrieve related chunks
3. **Section Reconstruction Engine** - Merge chunks intelligently

### Phase 2: Integration Layer
1. **Enhanced Hybrid Search Service** - Integrate with existing pipeline
2. **Configuration Management** - Per-tenant and per-query settings
3. **Performance Optimization** - Caching and concurrent fetching

### Phase 3: Validation & Testing
1. **Test Script Enhancement** - Validate complete section retrieval
2. **Performance Benchmarking** - Ensure acceptable latency
3. **Accuracy Validation** - Verify complete skill table retrieval

## Configuration Options

### Tenant-Level Configuration
```typescript
interface SectionAwareConfig {
  enabled: boolean;
  minConfidenceThreshold: number;     // 0.7
  maxSectionParts: number;           // 10
  maxAdditionalChunks: number;       // 20
  structureTypes: string[];          // ['table', 'list']
  reconstructionStrategy: 'merge' | 'reference' | 'hybrid';
}
```

### Query-Level Overrides
- Enable/disable section completion per query
- Adjust confidence thresholds for specific content types
- Control maximum additional chunks retrieved

## Performance Considerations

### Latency Management
- **Concurrent Fetching**: Retrieve related chunks in parallel
- **Smart Caching**: Cache section patterns and relationships
- **Timeout Handling**: Fallback to original results if section completion times out

### Resource Usage
- **Chunk Limits**: Cap additional chunks per section (default: 10)
- **Memory Management**: Stream large sections instead of loading entirely
- **Database Load**: Use efficient queries with proper indexing on `sectionPath`

## Backward Compatibility

### Existing Functionality
- All current hybrid search features remain unchanged
- Original chunk retrieval still works as fallback
- Existing APIs maintain the same interface

### Migration Strategy
- Feature flag controlled rollout
- A/B testing with percentage of queries
- Monitoring and rollback capabilities

## Success Metrics

### Functional Success
- **Complete Section Retrieval**: 95% of structured content sections retrieved completely
- **Skill Table Completeness**: All 7 skill tiers (Novice → Mythic) present in responses
- **Response Accuracy**: Improved LLM response completeness for structured queries

### Performance Success
- **Latency Impact**: <20% increase in average response time
- **Error Rate**: <1% additional error rate from section completion
- **Resource Usage**: <30% increase in database queries for section-heavy workloads

## Risk Mitigation

### Technical Risks
- **Timeout Handling**: Graceful degradation to original results
- **Memory Usage**: Streaming and chunked processing for large sections
- **Database Load**: Query optimization and caching strategies

### Functional Risks
- **Over-retrieval**: Confidence thresholds prevent excessive chunk fetching
- **Context Pollution**: Smart merging preserves relevance ranking
- **Accuracy Issues**: Validation framework ensures correct section reconstruction

## Next Steps

1. Implement core services (Section Detection, Related Chunk Fetcher, Reconstruction Engine)
2. Create integration layer with existing hybrid search
3. Develop comprehensive testing framework
4. Deploy with feature flags and monitoring
5. Validate with Artistry skill table test case
6. Gradual rollout with performance monitoring

This strategy ensures complete section retrieval while maintaining the performance and reliability of the existing RAG system.