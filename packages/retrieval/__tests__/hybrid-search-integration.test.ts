import {
  HybridSearchServiceImpl,
  createHybridSearchService,
  CachedHybridSearchService
} from '../src/services/hybrid-search.js';
import {
  KeywordSearchService
} from '../src/services/keyword-search.js';
import { ReciprocalRankFusionService } from '../src/services/rrf-fusion.js';
import {
  HybridSearchRequest,
  TenantSearchConfig
} from '../src/types/hybrid.js';
import { VectorSearchResult, VectorSearchParams } from '../src/types/vector.js';

// Mock implementations for testing
class MockVectorSearchService {
  async search(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]> {
    // Simulate vector search results based on query similarity
    const mockResults: VectorSearchResult[] = [
      {
        id: '67001fb9-f2f7-adb3-712b-5df9dc00c772', // Target chunk for testing
        vector: params.queryVector,
        score: 0.98,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Artificial intelligence and machine learning applications in modern computing',
          docId: '67001fb9-f2f7-adb3-712b-5df9dc00c772' // Consistent docId
        }
      },
      {
        id: 'doc1',
        vector: params.queryVector,
        score: 0.95,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'], // Ensure public access for some docs
          content: 'Machine learning algorithms for data analysis',
          docId: 'doc1'
        }
      },
      {
        id: 'doc2',
        vector: params.queryVector,
        score: 0.87,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'public'], // Ensure public access for some docs
          content: 'Deep learning neural networks implementation',
          docId: 'doc2'
        }
      },
      {
        id: 'doc3',
        vector: params.queryVector,
        score: 0.82,
        payload: {
          tenant: 'tenant2',
          acl: ['user2', 'public'], // Ensure public access for some docs
          content: 'Statistical analysis methods for research',
          docId: 'doc3'
        }
      }
    ];

    // Apply tenant and ACL filtering
    const filtered = mockResults.filter(result => {
      if (params.filter?.must) {
        const tenantFilter = params.filter.must.find((f: any) => f.key === 'tenant');
        const aclFilter = params.filter.must.find((f: any) => f.key === 'acl');

        if (tenantFilter && result.payload?.tenant !== tenantFilter.match.value) {
          return false;
        }

        if (aclFilter) {
          const documentAcl = Array.isArray(result.payload?.acl) ? result.payload.acl : [result.payload?.acl];
          const userAcls = aclFilter.match.any;
          // Document has access if any of its ACLs overlap with user's ACLs
          const hasAccess = userAcls.some((userAcl: string) =>
            documentAcl.includes(userAcl)
          );
          if (!hasAccess) return false;
        }
      }

      return true;
    });

    return filtered.slice(0, params.limit);
  }
}

class MockKeywordSearchService implements KeywordSearchService {
  async search(
    collectionName: string,
    query: string,
    limit: number,
    filter?: Record<string, any>
  ) {
    // Simulate keyword search results
    const mockResults = [
      {
        id: '67001fb9-f2f7-adb3-712b-5df9dc00c772', // Target chunk for testing
        score: 0.95,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Artificial intelligence and machine learning applications in modern computing'
        },
        content: 'Artificial intelligence and machine learning applications in modern computing'
      },
      {
        id: 'doc2',
        score: 0.92,
        payload: {
          tenant: 'tenant1',
          acl: ['user1'],
          content: 'Deep learning neural networks implementation'
        },
        content: 'Deep learning neural networks implementation'
      },
      {
        id: 'doc4',
        score: 0.88,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Machine learning model training techniques'
        },
        content: 'Machine learning model training techniques'
      },
      {
        id: 'doc1',
        score: 0.75,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Machine learning algorithms for data analysis'
        },
        content: 'Machine learning algorithms for data analysis'
      }
    ];

    // Apply filtering similar to vector search
    const filtered = mockResults.filter(result => {
      if (filter?.must) {
        const tenantFilter = filter.must.find((f: any) => f.key === 'tenant');
        const aclFilter = filter.must.find((f: any) => f.key === 'acl');

        if (tenantFilter && result.payload?.tenant !== tenantFilter.match.value) {
          return false;
        }

        if (aclFilter) {
          const documentAcl = Array.isArray(result.payload?.acl) ? result.payload.acl : [result.payload?.acl];
          const userAcls = aclFilter.match.any;
          const hasAccess = userAcls.some((userAcl: string) =>
            documentAcl.includes(userAcl)
          );
          if (!hasAccess) return false;
        }
      }

      return true;
    });

    return filtered.slice(0, limit);
  }
}

class MockEmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Return a mock vector based on text length (for consistency in tests)
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 384 }, (_, i) => Math.sin(hash + i) * 0.1);
  }
}

describe('Hybrid Search Integration Tests', () => {
  let hybridSearchService: HybridSearchServiceImpl;
  let mockVectorService: MockVectorSearchService;
  let mockKeywordService: MockKeywordSearchService;
  let mockEmbeddingService: MockEmbeddingService;
  let rrfFusionService: ReciprocalRankFusionService;

  const userTenants = ['tenant1'];
  const userAcl = ['user1', 'group1'];

  beforeEach(() => {
    mockVectorService = new MockVectorSearchService();
    mockKeywordService = new MockKeywordSearchService();
    mockEmbeddingService = new MockEmbeddingService();
    rrfFusionService = new ReciprocalRankFusionService();

    hybridSearchService = new HybridSearchServiceImpl(
      mockVectorService,
      mockKeywordService,
      rrfFusionService,
      mockEmbeddingService
    );
  });

  describe('End-to-End Hybrid Search', () => {
    it('should perform complete hybrid search with vector and keyword fusion', async () => {
      const request: HybridSearchRequest = {
        query: 'machine learning algorithms',
        limit: 5,
        enableKeywordSearch: true,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        rrfK: 60
      };

      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(request.limit);

      // Check that we have hybrid results
      const hybridResults = results.filter(r => r.searchType === 'hybrid');
      expect(hybridResults.length).toBeGreaterThan(0);

      // Verify metrics are populated
      expect(metrics.vectorSearchDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.keywordSearchDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.fusionDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.vectorResultCount).toBeGreaterThanOrEqual(0);
      expect(metrics.keywordResultCount).toBeGreaterThanOrEqual(0);
    });

    it('should respect RBAC filtering throughout the pipeline', async () => {
      const request: HybridSearchRequest = {
        query: 'data analysis',
        limit: 10,
        enableKeywordSearch: true
      };

      const restrictedUserTenants = ['tenant1'];
      const restrictedUserAcl = ['user1']; // Only user1, not group1

      const { finalResults: results } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        restrictedUserTenants,
        restrictedUserAcl
      );

      // All results should respect RBAC
      results.forEach(result => {
        expect(restrictedUserTenants).toContain(result.payload?.tenant);
        const documentAcl = Array.isArray(result.payload?.acl) ? result.payload.acl : [result.payload?.acl];
        const hasAccess = restrictedUserAcl.some(userAcl => documentAcl.includes(userAcl));
        expect(hasAccess).toBe(true);
      });
    });

    it('should handle vector-only search when keyword search is disabled', async () => {
      const request: HybridSearchRequest = {
        query: 'neural networks',
        limit: 3,
        enableKeywordSearch: false
      };

      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // Should only have vector-only results
      results.forEach(result => {
        expect(result.searchType).toBe('vector_only');
        expect(result.keywordScore).toBeUndefined();
        expect(result.vectorScore).toBeDefined();
      });

      // Keyword search duration should be 0
      expect(metrics.keywordSearchDuration).toBe(0);
      expect(metrics.keywordResultCount).toBe(0);
    });

    it('should handle different weight configurations', async () => {
      const vectorHeavyRequest: HybridSearchRequest = {
        query: 'statistical methods',
        limit: 5,
        enableKeywordSearch: true,
        vectorWeight: 0.9,
        keywordWeight: 0.1,
        rrfK: 60
      };

      const keywordHeavyRequest: HybridSearchRequest = {
        query: 'statistical methods',
        limit: 5,
        enableKeywordSearch: true,
        vectorWeight: 0.1,
        keywordWeight: 0.9,
        rrfK: 60
      };

      const vectorHeavyResults = await hybridSearchService.searchLegacy(
        'test_collection',
        vectorHeavyRequest,
        userTenants,
        userAcl
      );

      const keywordHeavyResults = await hybridSearchService.searchLegacy(
        'test_collection',
        keywordHeavyRequest,
        userTenants,
        userAcl
      );

      expect(vectorHeavyResults.finalResults).toBeDefined();
      expect(keywordHeavyResults.finalResults).toBeDefined();

      // Results might be ordered differently due to different weights
      expect(vectorHeavyResults.finalResults.length).toBeGreaterThan(0);
      expect(keywordHeavyResults.finalResults.length).toBeGreaterThan(0);
    });

    it('should respect different RRF k values', async () => {
      const lowKRequest: HybridSearchRequest = {
        query: 'research methodology',
        limit: 5,
        enableKeywordSearch: true,
        rrfK: 10
      };

      const highKRequest: HybridSearchRequest = {
        query: 'research methodology',
        limit: 5,
        enableKeywordSearch: true,
        rrfK: 100
      };

      const lowKResults = await hybridSearchService.searchLegacy(
        'test_collection',
        lowKRequest,
        userTenants,
        userAcl
      );

      const highKResults = await hybridSearchService.searchLegacy(
        'test_collection',
        highKRequest,
        userTenants,
        userAcl
      );

      expect(lowKResults.finalResults).toBeDefined();
      expect(highKResults.finalResults).toBeDefined();

      // Lower k should generally result in higher fusion scores for top-ranked items
      if (lowKResults.finalResults.length > 0 && highKResults.finalResults.length > 0) {
        const lowKTopScore = Math.max(...lowKResults.finalResults.map(r => r.fusionScore || 0));
        const highKTopScore = Math.max(...highKResults.finalResults.map(r => r.fusionScore || 0));
        expect(lowKTopScore).toBeGreaterThanOrEqual(highKTopScore);
      }
    });
  });

  describe('Tenant Configuration Management', () => {
    it('should use default configuration when no tenant config exists', async () => {
      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 3,
        tenantId: 'nonexistent_tenant'
      };

      const { finalResults: results } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
    });

    it('should allow updating tenant configurations', async () => {
      const newConfig: TenantSearchConfig = {
        tenantId: 'tenant1',
        keywordSearchEnabled: false,
        defaultVectorWeight: 1.0,
        defaultKeywordWeight: 0.0,
        defaultRrfK: 30,
        rerankerEnabled: false
      };

      await hybridSearchService.updateTenantConfig(newConfig);
      const retrievedConfig = await hybridSearchService.getTenantConfig('tenant1');

      expect(retrievedConfig).toEqual(newConfig);
    });

    it('should respect tenant-specific keyword search settings', async () => {
      // Configure tenant to disable keyword search
      const config: TenantSearchConfig = {
        tenantId: 'tenant1',
        keywordSearchEnabled: false,
        defaultVectorWeight: 1.0,
        defaultKeywordWeight: 0.0,
        defaultRrfK: 60,
        rerankerEnabled: false
      };

      await hybridSearchService.updateTenantConfig(config);

      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 3,
        tenantId: 'tenant1'
        // enableKeywordSearch not specified, should use tenant config
      };

      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      // Should be vector-only due to tenant configuration
      expect(metrics.keywordSearchDuration).toBe(0);
      expect(metrics.keywordResultCount).toBe(0);
      results.forEach(result => {
        expect(result.searchType).toBe('vector_only');
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should complete search within performance targets', async () => {
      const request: HybridSearchRequest = {
        query: 'performance test query',
        limit: 10,
        enableKeywordSearch: true
      };

      const startTime = require('perf_hooks').performance.now();
      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );
      const endTime = require('perf_hooks').performance.now();

      expect(results).toBeDefined();

      // Performance targets from requirements
      expect(metrics.vectorSearchDuration).toBeLessThan(200); // <200ms
      expect(metrics.keywordSearchDuration).toBeLessThan(100); // <100ms
      expect(metrics.fusionDuration).toBeLessThan(50); // <50ms
      expect(metrics.totalDuration).toBeLessThan(500); // <500ms
      expect(endTime - startTime).toBeLessThan(1000); // Overall test should be fast
    });

    it('should handle caching correctly', async () => {
      const cachedService = new CachedHybridSearchService(
        mockVectorService,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'cached query test',
        limit: 5,
        enableKeywordSearch: true
      };

      // First search
      const firstResult = await cachedService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      // Second search (should use cache)
      const secondResult = await cachedService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(firstResult.finalResults).toEqual(secondResult.finalResults);
      // Second search should be much faster (cache hit)
      expect(secondResult.metrics.totalDuration).toBeLessThan(firstResult.metrics.totalDuration);
    });
  });

  describe('Error Handling', () => {
    it('should handle vector search failures gracefully', async () => {
      const failingVectorService = {
        async search() {
          throw new Error('Vector search failed');
        }
      };

      const faultyService = new HybridSearchServiceImpl(
        failingVectorService,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 3,
        enableKeywordSearch: true
      };

      // Expect graceful fallback: empty results
      const { finalResults, metrics } = await faultyService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(finalResults).toEqual([]);
      expect(metrics.vectorResultCount).toBe(0);
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0); // Still records duration
    });

    it('should handle keyword search failures gracefully', async () => {
      const failingKeywordService = {
        async search() {
          throw new Error('Keyword search failed');
        }
      };

      const faultyService = new HybridSearchServiceImpl(
        mockVectorService,
        failingKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'test query',
        limit: 3,
        enableKeywordSearch: true
      };

      // Expect graceful fallback: vector-only results
      const { finalResults, metrics } = await faultyService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(finalResults).toBeDefined();
      expect(finalResults.length).toBeGreaterThan(0);
      expect(finalResults.every(r => r.searchType === 'vector_only')).toBe(true);
      expect(metrics.vectorResultCount).toBeGreaterThan(0);
      expect(metrics.keywordResultCount).toBe(0);
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0); // Still records duration
    });

    it('should handle empty search results', async () => {
      const emptyVectorService = {
        async search(): Promise<VectorSearchResult[]> {
          return [];
        }
      };

      const emptyKeywordService = {
        async search() {
          return [];
        }
      };

      const emptyResultService = new HybridSearchServiceImpl(
        emptyVectorService,
        emptyKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'no results query',
        limit: 5,
        enableKeywordSearch: true
      };

      const { finalResults: results, metrics } = await emptyResultService.searchLegacy(
        'test_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toHaveLength(0);
      expect(metrics.vectorResultCount).toBe(0);
      expect(metrics.keywordResultCount).toBe(0);
      expect(metrics.finalResultCount).toBe(0);
    });
  });

  describe('Factory Function', () => {
    it('should create hybrid search service using factory function', () => {
      const service = createHybridSearchService(
        mockVectorService,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      expect(service).toBeInstanceOf(HybridSearchServiceImpl);
    });
  });
});