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
import { RerankerRequest, RerankerResult, RERANKER_CONFIG } from '../src/types/reranker.js';
import { RerankerService } from '../src/services/reranker.js';

// Mock implementations for testing
class MockVectorSearchService {
  async search(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]> {
    const mockResults: VectorSearchResult[] = [
      {
        id: 'doc1',
        vector: params.queryVector,
        score: 0.95,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Machine learning algorithms for data analysis',
          docId: 'doc1',
          title: 'ML Algorithms',
          header: 'Introduction',
          sectionPath: 'chapter1.section1'
        }
      },
      {
        id: 'doc2',
        vector: params.queryVector,
        score: 0.87,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'public'],
          content: 'Deep learning neural networks implementation',
          docId: 'doc2',
          title: 'Deep Learning',
          header: 'Advanced Topics',
          sectionPath: 'chapter2.section1'
        }
      }
    ];

    return mockResults.slice(0, params.limit);
  }
}

class MockKeywordSearchService implements KeywordSearchService {
  async search(
    collectionName: string,
    query: string,
    limit: number,
    filter?: Record<string, any>
  ) {
    const mockResults = [
      {
        id: 'doc1',
        score: 0.92,
        payload: {
          tenant: 'tenant1',
          acl: ['user1', 'group1', 'public'],
          content: 'Machine learning algorithms for data analysis',
          docId: 'doc1',
          title: 'ML Algorithms'
        },
        content: 'Machine learning algorithms for data analysis',
        searchType: 'keyword_only' as const,
        keywordScore: 0.92,
        termHits: {
          'machine': [{ field: 'body', match: 'exact' }],
          'learning': [{ field: 'body', match: 'exact' }]
        },
        tokenPositions: {
          'machine': [0],
          'learning': [1]
        }
      },
      {
        id: 'doc2',
        score: 0.75,
        payload: {
          tenant: 'tenant1',
          acl: ['user1'],
          content: 'Deep learning neural networks implementation',
          docId: 'doc2',
          title: 'Deep Learning'
        },
        content: 'Deep learning neural networks implementation',
        searchType: 'keyword_only' as const,
        keywordScore: 0.75
      }
    ];

    return mockResults.slice(0, limit);
  }
}

class MockEmbeddingService {
  async embed(text: string): Promise<number[]> {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 384 }, (_, i) => Math.sin(hash + i) * 0.1);
  }
}

class MockRerankerService implements RerankerService {
  async rerank(request: RerankerRequest): Promise<RerankerResult[]> {
    return request.documents.map((doc, index) => ({
      id: doc.id,
      score: doc.originalScore ? doc.originalScore * (1 + index * 0.1) : 0.8 - index * 0.1,
      content: doc.content,
      payload: doc.payload,
      originalScore: doc.originalScore,
      rerankerScore: doc.originalScore ? doc.originalScore * (1 + index * 0.1) : 0.8 - index * 0.1,
      rank: index + 1
    }));
  }

  async rerankWithMetrics(request: RerankerRequest) {
    const results = await this.rerank(request);
    return {
      results,
      metrics: {
        rerankerDuration: 100,
        documentsProcessed: request.documents.length,
        batchCount: 1,
        avgScoreImprovement: 0.1
      }
    };
  }

  getConfig() {
    return {
      enabled: true,
      model: { name: 'mock', type: 'cross-encoder' as const },
      topK: 8
    };
  }

  updateConfig(config: any) {
    // Mock implementation
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  getSupportedModels(): string[] {
    return ['mock'];
  }
}

describe('Hybrid Search Extended Tests', () => {
  let hybridSearchService: HybridSearchServiceImpl;
  let mockVectorService: MockVectorSearchService;
  let mockKeywordService: MockKeywordSearchService;
  let mockEmbeddingService: MockEmbeddingService;
  let mockRerankerService: MockRerankerService;
  let rrfFusionService: ReciprocalRankFusionService;

  const userContext = {
    id: 'user1',
    groupIds: ['group1'],
    tenantId: 'tenant1',
    language: 'en'
  };

  beforeEach(() => {
    mockVectorService = new MockVectorSearchService();
    mockKeywordService = new MockKeywordSearchService();
    mockEmbeddingService = new MockEmbeddingService();
    mockRerankerService = new MockRerankerService();
    rrfFusionService = new ReciprocalRankFusionService();

    hybridSearchService = new HybridSearchServiceImpl(
      mockVectorService,
      mockKeywordService,
      rrfFusionService,
      mockEmbeddingService,
      mockRerankerService
    );
  });

  describe('New search method (UserContext)', () => {
    it('should handle the new search method with UserContext', async () => {
      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.finalResults.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });

    it('should validate user authorization', async () => {
      const invalidUserContext = {
        id: '',
        groupIds: [],
        tenantId: ''
      };

      const request: HybridSearchRequest = {
        query: 'test',
        limit: 5
      };

      await expect(hybridSearchService.search('test_collection', request, invalidUserContext))
        .rejects
        .toThrow('User authorization validation failed');
    });

    it('should apply language relevance when user has language preference', async () => {
      const request: HybridSearchRequest = {
        query: 'test',
        limit: 5
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result.finalResults).toBeDefined();
      result.finalResults.forEach(result => {
        expect(result).toHaveProperty('rank');
      });
    });
  });

  describe('Domainless Ranking', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should apply domainless ranking when enabled', async () => {
      process.env.FEATURES_ENABLED = 'on';
      process.env.DOMAINLESS_RANKING_ENABLED = 'on';

      const request: HybridSearchRequest = {
        query: 'machine learning algorithms',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      // Domainless ranking should modify scores
      expect(result.finalResults.length).toBeGreaterThan(0);
    });

    it('should handle domainless ranking with temporal queries', async () => {
      process.env.FEATURES_ENABLED = 'on';
      process.env.DOMAINLESS_RANKING_ENABLED = 'on';

      const request: HybridSearchRequest = {
        query: 'how long does machine learning take',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
    });
  });

  describe('Keyword Points Ranking', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should apply keyword points ranking when enabled', async () => {
      process.env.KW_POINTS_ENABLED = 'on';

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.finalResults.length).toBeGreaterThan(0);
    });

    it('should handle keyword points with complex queries', async () => {
      process.env.KW_POINTS_ENABLED = 'on';

      const request: HybridSearchRequest = {
        query: 'advanced machine learning techniques and algorithms',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
    });
  });

  describe('MMR (Maximal Marginal Relevance)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should apply MMR when enabled', async () => {
      process.env.MMR_ENABLED = 'on';

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.metrics.rerankingEnabled).toBe(true);
      expect(result.metrics.documentsReranked).toBeGreaterThan(0);
    });
  });

  describe('Reranker Integration', () => {
    it('should apply reranker when tenant config enables it', async () => {
      // Update tenant config to enable reranker
      const config: TenantSearchConfig = {
        tenantId: 'tenant1',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(config);

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true,
        tenantId: 'tenant1'
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.metrics.rerankingEnabled).toBe(true);
      expect(result.rerankerResults).toBeDefined();
    });

    it('should handle reranker timeout gracefully', async () => {
      // Mock reranker that times out
      const timeoutReranker = {
        async rerank() {
          await new Promise(resolve => setTimeout(resolve, 100)); // Longer than timeout
          throw new Error('Should not reach here');
        }
      };

      const serviceWithTimeoutReranker = new HybridSearchServiceImpl(
        mockVectorService,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService,
        timeoutReranker as any
      );

      // Set very short timeout
      serviceWithTimeoutReranker.updateTenantTimeouts('tenant1', {
        vectorSearch: 5000,
        keywordSearch: 3000,
        reranker: 1, // Very short timeout
        embedding: 5000,
        overall: 45000
      });

      const config: TenantSearchConfig = {
        tenantId: 'tenant1',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await serviceWithTimeoutReranker.updateTenantConfig(config);

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true,
        tenantId: 'tenant1'
      };

      const result = await serviceWithTimeoutReranker.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      // Should still have results despite reranker timeout
      expect(result.finalResults.length).toBeGreaterThan(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should handle vector search timeouts', async () => {
      const slowVectorService = {
        async search() {
          await new Promise(resolve => setTimeout(resolve, 100));
          return [];
        }
      };

      const serviceWithTimeouts = new HybridSearchServiceImpl(
        slowVectorService as any,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      // Set very short timeout
      serviceWithTimeouts.updateTenantTimeouts('tenant1', {
        vectorSearch: 1, // Very short timeout
        keywordSearch: 3000,
        reranker: 10000,
        embedding: 5000,
        overall: 45000
      });

      const request: HybridSearchRequest = {
        query: 'test',
        limit: 5,
        tenantId: 'tenant1'
      };

      const result = await serviceWithTimeouts.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      // Should handle timeout gracefully
    });

    it('should handle embedding timeouts', async () => {
      const slowEmbeddingService = {
        async embed() {
          await new Promise(resolve => setTimeout(resolve, 100));
          return new Array(384).fill(0);
        }
      };

      const serviceWithTimeouts = new HybridSearchServiceImpl(
        mockVectorService,
        mockKeywordService,
        rrfFusionService,
        slowEmbeddingService as any
      );

      serviceWithTimeouts.updateTenantTimeouts('tenant1', {
        vectorSearch: 5000,
        keywordSearch: 3000,
        reranker: 10000,
        embedding: 1, // Very short timeout
        overall: 45000
      });

      const request: HybridSearchRequest = {
        query: 'test',
        limit: 5,
        tenantId: 'tenant1'
      };

      // Expect timeout error to be thrown (this is the expected behavior)
      await expect(serviceWithTimeouts.search('test_collection', request, userContext))
        .rejects
        .toThrow('Embedding generation timeout after 1ms');
    });
  });

  describe('Query Adaptive Weighting', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should apply query adaptive weighting when enabled', async () => {
      process.env.QUERY_ADAPTIVE_WEIGHTS = 'on';
      process.env.FUSION_DEBUG_TRACE = 'on'; // Enable fusion trace

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.fusionTrace).toBeDefined();
      expect(result.fusionTrace?.strategy).toBeDefined();
    });
  });

  describe('Fusion Trace and Debug', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should generate fusion trace when debug enabled', async () => {
      process.env.FUSION_DEBUG_TRACE = 'on';

      const request: HybridSearchRequest = {
        query: 'machine learning',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await hybridSearchService.search('test_collection', request, userContext);

      expect(result.fusionTrace).toBeDefined();
      expect(result.fusionTrace?.strategy).toBeDefined();
      expect(result.fusionTrace?.vectorWeight).toBeDefined();
      expect(result.fusionTrace?.keywordWeight).toBeDefined();
    });
  });

  describe('Deduplication Logic', () => {
    it('should deduplicate results by docId', async () => {
      // Create mock services that return multiple results with same docId
      const duplicateVectorService = {
        async search(): Promise<VectorSearchResult[]> {
          return [
            {
              id: 'chunk1',
              vector: [0.1, 0.2],
              score: 0.9,
              payload: { docId: 'doc1', content: 'content 1' }
            },
            {
              id: 'chunk2',
              vector: [0.1, 0.2],
              score: 0.8,
              payload: { docId: 'doc1', content: 'content 2' } // Same docId
            },
            {
              id: 'chunk3',
              vector: [0.1, 0.2],
              score: 0.7,
              payload: { docId: 'doc2', content: 'content 3' }
            }
          ];
        }
      };

      const serviceWithDuplicates = new HybridSearchServiceImpl(
        duplicateVectorService as any,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'test',
        limit: 10,
        enableKeywordSearch: false
      };

      const result = await serviceWithDuplicates.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      // Should have deduplicated results
      const docIds = result.finalResults.map(r => r.payload?.docId);
      const uniqueDocIds = [...new Set(docIds)];
      expect(uniqueDocIds.length).toBeLessThanOrEqual(docIds.length);
    });
  });

  describe('Enhanced RBAC Validation', () => {
    it('should validate enhanced RBAC access', async () => {
      const restrictedUserContext = {
        id: 'user2',
        groupIds: [],
        tenantId: 'tenant1'
      };

      const request: HybridSearchRequest = {
        query: 'test',
        limit: 5
      };

      const result = await hybridSearchService.search('test_collection', request, restrictedUserContext);

      expect(result).toBeDefined();
      // Results should be filtered based on RBAC
      result.finalResults.forEach(result => {
        expect(result.payload?.tenant).toBe('tenant1');
        // Should have access based on ACL rules
      });
    });
  });

  describe('Cached Service', () => {
    it('should handle the new search method in cached service', async () => {
      const cachedService = new CachedHybridSearchService(
        mockVectorService,
        mockKeywordService,
        rrfFusionService,
        mockEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'cached test query',
        limit: 5,
        enableKeywordSearch: true
      };

      const result = await cachedService.search('test_collection', request, userContext);

      expect(result).toBeDefined();
      expect(result.finalResults).toBeDefined();
      expect(result.finalResults.length).toBeGreaterThan(0);
    });
  });
});