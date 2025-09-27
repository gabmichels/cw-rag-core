import {
  createHybridSearchService,
  VectorSearchService,
  HybridSearchServiceImpl
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

/**
 * Comprehensive end-to-end test for the complete RAG retrieval pipeline
 * This test demonstrates the full flow: Vector Search → Keyword Search → RRF Fusion → Reranking
 */

// Realistic mock data for testing
const MOCK_DOCUMENTS = [
  {
    id: 'doc_ai_1',
    content: 'Artificial intelligence and machine learning are transforming modern technology through deep neural networks and advanced algorithms.',
    metadata: { category: 'technology', importance: 'high', tenant: 'acme', acl: ['read', 'write', 'admin'] }
  },
  {
    id: 'doc_ai_2',
    content: 'AI systems require vast amounts of data and computational resources to train complex models effectively.',
    metadata: { category: 'technology', importance: 'medium', tenant: 'acme', acl: ['read'] }
  },
  {
    id: 'doc_ml_1',
    content: 'Machine learning algorithms can identify patterns in large datasets and make predictions based on historical data.',
    metadata: { category: 'analytics', importance: 'high', tenant: 'acme', acl: ['read', 'admin'] }
  },
  {
    id: 'doc_data_1',
    content: 'Data preprocessing and feature engineering are critical steps in the machine learning pipeline for achieving optimal model performance.',
    metadata: { category: 'analytics', importance: 'medium', tenant: 'acme', acl: ['read'] }
  },
  {
    id: 'doc_nlp_1',
    content: 'Natural language processing enables computers to understand and generate human language through sophisticated linguistic models.',
    metadata: { category: 'nlp', importance: 'high', tenant: 'acme', acl: ['read'] }
  },
  {
    id: 'doc_vision_1',
    content: 'Computer vision systems can analyze and interpret visual information using convolutional neural networks and image processing techniques.',
    metadata: { category: 'vision', importance: 'medium', tenant: 'acme', acl: ['read'] }
  },
  {
    id: 'doc_robotics_1',
    content: 'Robotics combines mechanical engineering with artificial intelligence to create autonomous systems capable of complex tasks.',
    metadata: { category: 'robotics', importance: 'low', tenant: 'acme', acl: ['read'] }
  },
  {
    id: 'doc_unrelated_1',
    content: 'Cooking recipes and culinary techniques for preparing delicious meals with fresh ingredients.',
    metadata: { category: 'cooking', importance: 'low', tenant: 'acme', acl: ['read'] }
  },
  {
    id: '67001fb9-f2f7-adb3-712b-5df9dc00c772',
    content: 'Artificial intelligence and machine learning applications span multiple domains including computer vision, natural language processing, deep learning neural networks, and robotics integration. These technologies enable breakthrough innovations in healthcare, finance, and autonomous systems.',
    metadata: { category: 'technology', importance: 'critical', tenant: 'acme', acl: ['read', 'write', 'admin'] }
  }
];

class RealisticVectorSearchService implements VectorSearchService {
  async search(collectionName: string, params: any): Promise<VectorSearchResult[]> {
    // Simulate vector search results with realistic relevance scores
    // Higher scores for AI/ML related content when query is about "artificial intelligence"
    const queryRelevance = {
      'doc_ai_1': 0.95,
      'doc_ai_2': 0.88,
      'doc_ml_1': 0.82,
      'doc_nlp_1': 0.75,
      'doc_data_1': 0.68,
      'doc_vision_1': 0.62,
      'doc_robotics_1': 0.55,
      'doc_unrelated_1': 0.15,
      '67001fb9-f2f7-adb3-712b-5df9dc00c772': 0.92
    };

    let filteredDocs = MOCK_DOCUMENTS;

    // Apply RBAC filtering if filter is provided
    if (params.filter && params.filter.must) {
      filteredDocs = MOCK_DOCUMENTS.filter(doc => {
        // Check tenant
        const tenantCondition = params.filter.must.find((c: any) => c.key === 'tenant');
        if (tenantCondition && doc.metadata.tenant !== tenantCondition.match.value) {
          return false;
        }

        // Check ACL
        const aclCondition = params.filter.must.find((c: any) => c.key === 'acl');
        if (aclCondition && aclCondition.match.any) {
          const allowedAcl = aclCondition.match.any;
          if (!doc.metadata.acl.some((acl: string) => allowedAcl.includes(acl))) {
            return false;
          }
        }

        return true;
      });
    }

    return Object.entries(queryRelevance)
      .filter(([id]) => filteredDocs.some(doc => doc.id === id))
      .map(([id, score]) => {
        const doc = MOCK_DOCUMENTS.find(d => d.id === id)!;
        return {
          id,
          score,
          vector: Array(384).fill(0).map(() => Math.random()), // Mock 384-dim vector
          payload: {
            content: doc.content,
            ...doc.metadata
          }
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit || 10);
  }
}

class RealisticKeywordSearchService implements KeywordSearchService {
  async search(collectionName: string, query: string, limit: number, filter?: any): Promise<any[]> {
    // Simulate BM25-style keyword matching
    const queryTerms = query.toLowerCase().split(/\s+/);

    let filteredDocs = MOCK_DOCUMENTS;

    // Apply RBAC filtering if filter is provided
    if (filter && filter.must) {
      filteredDocs = MOCK_DOCUMENTS.filter(doc => {
        // Check tenant
        const tenantCondition = filter.must.find((c: any) => c.key === 'tenant');
        if (tenantCondition && doc.metadata.tenant !== tenantCondition.match.value) {
          return false;
        }

        // Check ACL
        const aclCondition = filter.must.find((c: any) => c.key === 'acl');
        if (aclCondition && aclCondition.match.any) {
          const allowedAcl = aclCondition.match.any;
          if (!doc.metadata.acl.some((acl: string) => allowedAcl.includes(acl))) {
            return false;
          }
        }

        return true;
      });
    }

    const results = filteredDocs.map(doc => {
      const content = doc.content.toLowerCase();
      let score = 0;

      // Calculate term frequency and relevance
      for (const term of queryTerms) {
        if (content.includes(term)) {
          // Boost score based on term importance and frequency
          const termFreq = (content.match(new RegExp(term, 'g')) || []).length;
          const importance = term === 'artificial' || term === 'intelligence' ? 2.0 : 1.0;
          score += termFreq * importance * 0.3; // BM25-like scoring
        }
      }

      return {
        id: doc.id,
        score: Math.min(score, 1.0), // Cap at 1.0
        content: doc.content,
        payload: {
          content: doc.content,
          ...doc.metadata
        }
      };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return results;
  }
}

class RealisticEmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Generate deterministic but realistic embeddings based on text content
    const words = text.toLowerCase().split(/\s+/);
    const embedding = Array(384).fill(0);

    // Create semantic-like embeddings based on key terms
    const semanticMap: Record<string, number[]> = {
      'artificial': [0.8, 0.2, 0.1],
      'intelligence': [0.9, 0.3, 0.2],
      'machine': [0.7, 0.8, 0.1],
      'learning': [0.6, 0.9, 0.2],
      'neural': [0.8, 0.7, 0.9],
      'data': [0.5, 0.6, 0.8]
    };

    for (const word of words) {
      if (semanticMap[word]) {
        const values = semanticMap[word];
        for (let i = 0; i < values.length && i < embedding.length; i++) {
          embedding[i] += values[i] / words.length;
        }
      }
    }

    // Fill rest with normalized random values
    for (let i = 3; i < embedding.length; i++) {
      embedding[i] = Math.sin(text.charCodeAt(i % text.length) + i) * 0.1;
    }

    return embedding;
  }
}

describe('Complete RAG Pipeline Integration', () => {
  let vectorSearchService: RealisticVectorSearchService;
  let keywordSearchService: RealisticKeywordSearchService;
  let rrfFusionService: ReciprocalRankFusionService;
  let embeddingService: RealisticEmbeddingService;
  let rerankerService: MockRerankerService;
  let hybridSearchService: HybridSearchServiceImpl;

  beforeEach(() => {
    vectorSearchService = new RealisticVectorSearchService();
    keywordSearchService = new RealisticKeywordSearchService();
    rrfFusionService = new ReciprocalRankFusionService();
    embeddingService = new RealisticEmbeddingService();

    const rerankerConfig: RerankerConfig = {
      ...DEFAULT_RERANKER_CONFIG,
      enabled: true,
      model: RERANKER_MODELS.BGE_RERANKER_LARGE,
      topK: 8,
      scoreThreshold: 0.1
    };

    rerankerService = new MockRerankerService(rerankerConfig);

    // Configure reranker with realistic scores that demonstrate reranking value
    rerankerService.setMockScores({
      'doc_ai_1': 0.95,   // AI document - should rank highest
      'doc_ml_1': 0.90,   // ML document - should rank high
      'doc_nlp_1': 0.85,  // NLP document - should rank well
      'doc_ai_2': 0.80,   // Second AI document
      'doc_data_1': 0.70, // Data document - relevant but lower
      'doc_vision_1': 0.60, // Vision document - somewhat relevant
      'doc_robotics_1': 0.50, // Robotics - AI related but less relevant
      'doc_unrelated_1': 0.05, // Cooking - should rank very low
      '67001fb9-f2f7-adb3-712b-5df9dc00c772': 0.94 // Target chunk - high score but not highest
    });

    hybridSearchService = createHybridSearchService(
      vectorSearchService,
      keywordSearchService,
      rrfFusionService,
      embeddingService,
      rerankerService
    ) as HybridSearchServiceImpl;
  });

  describe('End-to-End Pipeline Flow', () => {
    it('should execute complete pipeline: Vector → Keyword → Fusion → Reranking', async () => {
      // Configure tenant with reranking enabled
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'test-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true,
        rerankerConfig: {
          model: RERANKER_MODELS.BGE_RERANKER_LARGE.name,
          topK: 5,
          scoreThreshold: 0.1
        }
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'artificial intelligence machine learning algorithms',
        limit: 8,
        tenantId: 'test-tenant',
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        rrfK: 60
      };

      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'ai-knowledge-base',
        request,
        ['acme'], // tenant access
        ['read']  // ACL permissions
      );

      // Verify pipeline execution
      expect(metrics.vectorSearchDuration).toBeGreaterThan(0);
      expect(metrics.keywordSearchDuration).toBeGreaterThan(0);
      expect(metrics.fusionDuration).toBeGreaterThan(0);
      expect(metrics.rerankerDuration).toBeGreaterThan(0);
      expect(metrics.totalDuration).toBeGreaterThan(0);

      // Verify result counts
      expect(metrics.vectorResultCount).toBeGreaterThan(0);
      expect(metrics.keywordResultCount).toBeGreaterThan(0);
      expect(metrics.documentsReranked).toBeGreaterThan(0);
      expect(metrics.rerankingEnabled).toBe(true);

      // Verify final results
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5); // Respects reranker topK

      // Verify reranking improved relevance
      expect(results[0].id).toBe('doc_ai_1'); // Should be top result due to high reranker score
      expect(results[0].score).toBe(0.95); // Should use reranker score
      expect(results[0].fusionScore).toBe(0.95); // Updated to reranker score

      // Verify original scores are preserved
      expect(results[0].vectorScore).toBeDefined();
      expect(results[0].searchType).toBeDefined();

      // Verify ranking order reflects reranker scores
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
        expect(results[i].rank).toBe(i + 1);
      }
    });

    it('should demonstrate reranking value over fusion-only results', async () => {
      // First, get results without reranking
      const noRerankerService = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService
        // No reranker
      ) as HybridSearchServiceImpl;

      const request: HybridSearchRequest = {
        query: 'artificial intelligence machine learning',
        limit: 8
      };

      const { finalResults: fusionOnly } = await noRerankerService.searchLegacy(
        'ai-knowledge-base',
        request,
        ['acme'],
        ['read']
      );

      // Now get results with reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'rerank-test',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const { finalResults: withReranking } = await hybridSearchService.searchLegacy(
        'ai-knowledge-base',
        { ...request, tenantId: 'rerank-test' },
        ['acme'],
        ['read']
      );

      // Verify reranking changed the order
      expect(fusionOnly.length).toBeGreaterThan(0);
      expect(withReranking.length).toBeGreaterThan(0);

      // The top result with reranking should be doc_ai_1 due to our mock scores
      expect(withReranking[0].id).toBe('doc_ai_1');

      // Verify that reranking improved semantic relevance
      // (our mock reranker gives higher scores to more AI-relevant documents)
      const aiDocPositionFusion = fusionOnly.findIndex(r => r.id === 'doc_ai_1');
      const aiDocPositionRerank = withReranking.findIndex(r => r.id === 'doc_ai_1');

      expect(aiDocPositionRerank).toBeLessThanOrEqual(aiDocPositionFusion);
    });

    it.skip('should handle the full pipeline with performance requirements', async () => {
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'perf-test',
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
        query: 'machine learning data science artificial intelligence',
        limit: 20, // Test with 20 documents for reranking
        tenantId: 'perf-test'
      };

      const startTime = performance.now();
      const { finalResults: results, metrics } = await hybridSearchService.searchLegacy(
        'large-knowledge-base',
        request,
        ['acme'],
        ['read']
      );
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      // Performance requirements
      expect(totalTime).toBeLessThan(1000); // Total pipeline < 1 second
      expect(metrics.rerankerDuration!).toBeLessThan(200); // Reranking < 200ms
      expect(metrics.vectorSearchDuration).toBeLessThan(500);
      expect(metrics.keywordSearchDuration).toBeLessThan(500);
      expect(metrics.fusionDuration).toBeLessThan(100);

      // Quality requirements
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(8); // Respects topK
      expect(metrics.rerankingEnabled).toBe(true);
      expect(metrics.documentsReranked).toBeGreaterThan(0);

      // Verify results have all required properties
      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(result.score).toBeDefined();
        expect(result.fusionScore).toBeDefined();
        expect(result.rank).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.payload).toBeDefined();
        expect(result.searchType).toBeDefined();
      }
    });

    it('should maintain RBAC and tenant isolation throughout pipeline', async () => {
      // Configure tenant with reranking
      const tenantConfig: TenantSearchConfig = {
        tenantId: 'secure-tenant',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await hybridSearchService.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'artificial intelligence security',
        limit: 10,
        tenantId: 'secure-tenant'
      };

      // Test with proper permissions
      const { finalResults: authorizedResults } = await hybridSearchService.searchLegacy(
        'secure-collection',
        request,
        ['acme'], // Has access to tenant
        ['read']  // Has read permission
      );

      // Test with restricted ACL
      const { finalResults: restrictedResults } = await hybridSearchService.searchLegacy(
        'secure-collection',
        request,
        ['acme'],
        ['admin'] // Different ACL - should filter out some results
      );

      // Test with wrong tenant
      const { finalResults: wrongTenantResults } = await hybridSearchService.searchLegacy(
        'secure-collection',
        request,
        ['different-tenant'],
        ['read']
      );

      expect(authorizedResults.length).toBeGreaterThan(0);
      expect(restrictedResults.length).toBeLessThanOrEqual(authorizedResults.length);
      expect(wrongTenantResults.length).toBe(0); // Should be filtered out

      // Verify all returned results respect RBAC
      for (const result of authorizedResults) {
        expect(result.payload?.tenant).toBe('acme');
        expect(result.payload?.acl).toContain('read');
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should gracefully handle reranker failures while maintaining search quality', async () => {
      // Use unreliable reranker that fails sometimes
      const unreliableReranker = MockRerankerServiceFactory.createUnreliable({
        ...DEFAULT_RERANKER_CONFIG,
        enabled: true
      });

      const serviceWithUnreliableReranker = createHybridSearchService(
        vectorSearchService,
        keywordSearchService,
        rrfFusionService,
        embeddingService,
        unreliableReranker
      ) as HybridSearchServiceImpl;

      const tenantConfig: TenantSearchConfig = {
        tenantId: 'resilience-test',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true
      };

      await serviceWithUnreliableReranker.updateTenantConfig(tenantConfig);

      const request: HybridSearchRequest = {
        query: 'artificial intelligence resilience test',
        limit: 8,
        tenantId: 'resilience-test'
      };

      // Even with unreliable reranker, search should still work
      const { finalResults: results, metrics } = await serviceWithUnreliableReranker.searchLegacy(
        'resilient-collection',
        request,
        ['acme'],
        ['read']
      );

      expect(results.length).toBeGreaterThan(0);
      expect(metrics.totalDuration).toBeGreaterThan(0);

      // Should have attempted reranking (duration > 0) but may have failed
      expect(metrics.rerankerDuration).toBeGreaterThan(0);

      // Results should still be valid even if reranking failed
      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(result.score).toBeDefined();
        expect(result.rank).toBeDefined();
      }
    });
  });

  describe('Configuration Flexibility', () => {
    it('should support different reranker configurations per tenant', async () => {
      // Tenant A: Aggressive reranking (low threshold, high topK)
      const aggressiveConfig: TenantSearchConfig = {
        tenantId: 'tenant-a',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true,
        rerankerConfig: {
          model: RERANKER_MODELS.BGE_RERANKER_LARGE.name,
          topK: 10,
          scoreThreshold: 0.0
        }
      };

      // Tenant B: Conservative reranking (high threshold, low topK)
      const conservativeConfig: TenantSearchConfig = {
        tenantId: 'tenant-b',
        keywordSearchEnabled: true,
        defaultVectorWeight: 0.7,
        defaultKeywordWeight: 0.3,
        defaultRrfK: 60,
        rerankerEnabled: true,
        rerankerConfig: {
          model: RERANKER_MODELS.BGE_RERANKER_LARGE.name,
          topK: 3,
          scoreThreshold: 0.7
        }
      };

      await hybridSearchService.updateTenantConfig(aggressiveConfig);
      await hybridSearchService.updateTenantConfig(conservativeConfig);

      const baseRequest: HybridSearchRequest = {
        query: 'artificial intelligence configuration test',
        limit: 15
      };

      // Test aggressive tenant
      const { finalResults: aggressiveResults } = await hybridSearchService.searchLegacy(
        'config-test',
        { ...baseRequest, tenantId: 'tenant-a' },
        ['acme'],
        ['read']
      );

      // Test conservative tenant
      const { finalResults: conservativeResults } = await hybridSearchService.searchLegacy(
        'config-test',
        { ...baseRequest, tenantId: 'tenant-b' },
        ['acme'],
        ['read']
      );

      // Aggressive should return more results
      expect(aggressiveResults.length).toBeGreaterThan(conservativeResults.length);
      expect(conservativeResults.length).toBeLessThanOrEqual(3); // Respects topK

      // Conservative should have higher average scores (due to threshold)
      if (conservativeResults.length > 0) {
        const conservativeAvgScore = conservativeResults.reduce((sum, r) => sum + r.score, 0) / conservativeResults.length;
        expect(conservativeAvgScore).toBeGreaterThan(0.7);
      }
    });
  });
});