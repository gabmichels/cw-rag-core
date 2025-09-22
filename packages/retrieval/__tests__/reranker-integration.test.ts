import {
  createHybridSearchService,
  VectorSearchService
} from '../src/services/hybrid-search.js';
import { KeywordSearchService } from '../src/services/keyword-search.js';
import { ReciprocalRankFusionService } from '../src/services/rrf-fusion.js';
import { MockRerankerService, MockRerankerServiceFactory } from '../src/services/mock-reranker.js';
import {
  HybridSearchRequest,
  TenantSearchConfig
} from '../src/types/hybrid.js';
import {
  RerankerConfig,
  DEFAULT_RERANKER_CONFIG,
  RERANKER_MODELS
} from '../src/types/reranker.js';
import { VectorSearchResult } from '../src/types/vector.js';

// Mock implementations
class MockVectorSearchService implements VectorSearchService {
  async search(): Promise<VectorSearchResult[]> {
    return [
      {
        id: 'vec1',
        score: 0.9,
        vector: [0.1, 0.2, 0.3], // Mock vector
        payload: { content: 'Vector search result 1', tenant: 'test', acl: ['read'] }
      },
      {
        id: 'vec2',
        score: 0.7,
        vector: [0.4, 0.5, 0.6], // Mock vector
        payload: { content: 'Vector search result 2', tenant: 'test', acl: ['read'] }
      },
      {
        id: 'vec3',
        score: 0.6,
        vector: [0.7, 0.8, 0.9], // Mock vector
        payload: { content: 'Vector search result 3', tenant: 'test', acl: ['read'] }
      }
    ];
  }
}

class MockKeywordSearchService implements KeywordSearchService {
  async search(): Promise<any[]> {
    return [
      {
        id: 'key1',
        score: 0.8,
        content: 'Keyword search result 1',
        payload: { tenant: 'test', acl: ['read'] }
      },
      {
        id: 'key2',
        score: 0.5,
        content: 'Keyword search result 2',
        payload: { tenant: 'test', acl: ['read'] }
      },
      {
        id: 'vec2', // Overlapping with vector results
        score: 0.4,
        content: 'Overlapping result',
        payload: { tenant: 'test', acl: ['read'] }
      }
    ];
  }
}

class MockEmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Return deterministic embedding based on text length
    const length = text.length;
    return Array(384).fill(0).map((_, i) => (length + i) / 1000);
  }
}

describe('Reranker Integration Tests', () => {
  let vectorSearchService: MockVectorSearchService;
  let keywordSearchService: MockKeywordSearchService;
  let rrfFusionService: ReciprocalRankFusionService;
  let embeddingService: MockEmbeddingService;
  let rerankerConfig: RerankerConfig;

  beforeEach(() => {
    vectorSearchService = new MockVectorSearchService();
    keywordSearchService = new MockKeywordSearchService();
    rrfFusionService = new ReciprocalRankFusionService();
    embeddingService = new MockEmbeddingService();

    rerankerConfig = {
      ...DEFAULT_RERANKER_CONFIG,
      enabled: true,
      topK: 8
    };
  });

  describe('Hybrid Search with Reranker Integration', () => {
    it('should integrate reranker with hybrid search pipeline', async () => {
      const rerankerService = new MockRerankerService(rerankerConfig);

      // Set specific scores to control reranking behavior
      rerankerService.setMockScores({
        'vec3': 0.95, // This should rank highest after reranking
        'vec1': 0.85,
        'vec2': 0.75,
        'key1': 0.70,
        'key2': 0.60
      });

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Enable reranking for test tenant
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'test-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true,
        rerankerConfig: {
          model: RERANKER_MODELS.BGE_RERANKER_LARGE.name,
          topK: 8,
          scoreThreshold: 0.0
        }
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'test query for reranking',
        limit: 10,
        tenantId: 'test-tenant'
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );

      // Verify reranking was applied
      expect(metrics.rerankingEnabled).toBe(true);
      expect(metrics.documentsReranked).toBeGreaterThan(0);
      expect(metrics.rerankerDuration).toBeGreaterThan(0);

      // Verify results are reranked (vec3 should be first due to high mock score)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('vec3');
      expect(results[0].score).toBe(0.95); // Should use reranker score

      // Verify original scores are preserved
      expect(results[0].vectorScore).toBeDefined();
      expect(results[0].fusionScore).toBe(0.95); // Updated to reranker score
    });

    it('should fallback gracefully when reranker fails', async () => {
      // Create an unreliable reranker that always fails
      const rerankerService = new MockRerankerService(rerankerConfig, { failureRate: 1.0 });

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Enable reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'test-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 10,
        tenantId: 'test-tenant'
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );

      // Should still return results despite reranker failure
      expect(results.length).toBeGreaterThan(0);
      expect(metrics.rerankingEnabled).toBe(false);
      expect(metrics.rerankerDuration).toBeGreaterThan(0); // Time spent trying

      // Results should be from fusion, not reranking
      expect(results[0].fusionScore).toBeDefined();
    });

    it('should work without reranker when disabled', async () => {
      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService
        // No reranker service provided
      );

      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 10
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );

      expect(results.length).toBeGreaterThan(0);
      expect(metrics.rerankingEnabled).toBe(false);
      expect(metrics.rerankerDuration).toBe(0);
      expect(metrics.documentsReranked).toBe(0);
    });

    it('should respect tenant-level reranker configuration', async () => {
      const rerankerService = new MockRerankerService(rerankerConfig);

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Tenant with reranking disabled
      const disabledTenantConfig: TenantSearchConfig = {
        tenantId: 'disabled-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: false
      };

      // Tenant with reranking enabled
      const enabledTenantConfig: TenantSearchConfig = {
        tenantId: 'enabled-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(disabledTenantConfig);
      await hybridSearchService.updateTenantConfig(enabledTenantConfig);

      // Test disabled tenant
      const disabledRequest: HybridSearchRequest = {
        query: 'test query',
        limit: 10,
        tenantId: 'disabled-tenant'
      };

      const disabledResult = await hybridSearchService.searchLegacy(
        'test-collection',
        disabledRequest,
        ['test'],
        ['read']
      );

      expect(disabledResult.metrics.rerankingEnabled).toBe(false);

      // Test enabled tenant
      const enabledRequest: HybridSearchRequest = {
        query: 'test query',
        limit: 10,
        tenantId: 'enabled-tenant'
      };

      const enabledResult = await hybridSearchService.searchLegacy(
        'test-collection',
        enabledRequest,
        ['test'],
        ['read']
      );

      expect(enabledResult.metrics.rerankingEnabled).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete reranking within performance targets', async () => {
      const rerankerService = MockRerankerServiceFactory.createFast(rerankerConfig);

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Enable reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'perf-test',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'performance test query',
        limit: 20, // Request more to test the 20-document limit
        tenantId: 'perf-test'
      };

      const startTime = performance.now();
      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );
      const endTime = performance.now();

      // Total time should be reasonable
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second

      // Reranker duration should meet target (<200ms for 20 docs)
      expect(metrics.rerankerDuration!).toBeLessThan(200);
      expect(metrics.rerankingEnabled).toBe(true);

      // Should handle the documents properly
      expect(results.length).toBeGreaterThan(0);
      expect(metrics.documentsReranked).toBeGreaterThan(0);
    });

    it('should handle batch processing efficiently', async () => {
      // Create many mock documents to test batching
      const largeBatchConfig = { ...rerankerConfig, batchSize: 5 };
      const rerankerService = new MockRerankerService(largeBatchConfig);

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Configure tenant for reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'batch-test',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'batch processing test',
        limit: 15, // Should trigger multiple batches
        tenantId: 'batch-test'
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );

      expect(metrics.rerankingEnabled).toBe(true);
      expect(metrics.documentsReranked).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty search results gracefully', async () => {
      // Mock services that return no results
      const emptyVectorService = {
        async search(): Promise<VectorSearchResult[]> { return []; }
      } as VectorSearchService;

      const emptyKeywordService = {
        async search(): Promise<any[]> { return []; }
      };

      const rerankerService = new MockRerankerService(rerankerConfig);

      const hybridSearchService = createHybridSearchService(
        emptyVectorService as VectorSearchService,
        emptyKeywordService as KeywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      const request: HybridSearchRequest = {
        query: 'no results query',
        limit: 10
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read']
      );

      expect(results).toHaveLength(0);
      expect(metrics.rerankingEnabled).toBe(false); // No documents to rerank
      expect(metrics.documentsReranked).toBe(0);
    });

    it('should maintain RBAC filtering after reranking', async () => {
      const rerankerService = new MockRerankerService(rerankerConfig);

      // Set high scores for documents with different ACLs
      rerankerService.setMockScores({
        'vec1': 0.95, // Has 'read' ACL
        'vec2': 0.85, // Has 'read' ACL
        'vec3': 0.75  // Has 'read' ACL
      });

      const hybridSearchService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        rerankerService
      );

      // Enable reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'rbac-test',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'rbac test query',
        limit: 10,
        tenantId: 'rbac-test'
      };

      // Search with limited ACL permissions
      const { results } = await hybridSearchService.searchLegacy(
        'test-collection',
        request,
        ['test'],
        ['read'] // Only 'read' permission
      );

      // All returned results should have proper ACL
      for (const result of results) {
        expect(result.payload?.acl).toContain('read');
      }
    });
  });
});