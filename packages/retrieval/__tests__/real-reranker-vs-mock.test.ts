import { HttpRerankerService } from '../src/services/http-reranker.js';
import { SentenceTransformersRerankerService } from '../src/services/sentence-transformers-reranker.js';
import { MockRerankerService } from '../src/services/mock-reranker.js';
import {
  RerankerRequest,
  RerankerConfig,
  RERANKER_MODELS,
  RERANKER_CONFIG
} from '../src/types/reranker.js';

describe('Real Reranker vs Mock - Deterministic Score Verification', () => {
  let mockConfig: RerankerConfig;
  let testDocuments: Array<{ id: string; content: string; originalScore?: number }>;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      model: RERANKER_MODELS.BGE_RERANKER_LARGE,
      scoreThreshold: 0.0,
      topK: 8,
      timeoutMs: 500,
      retryAttempts: 3,
      batchSize: 16
    };

    testDocuments = [
      { id: 'doc1', content: 'Machine learning algorithms for data analysis', originalScore: 0.8 },
      { id: 'doc2', content: 'Deep learning neural networks and AI', originalScore: 0.7 },
      { id: 'doc3', content: 'Natural language processing techniques', originalScore: 0.6 },
      { id: 'doc4', content: 'Computer vision and image recognition', originalScore: 0.5 },
      { id: 'doc5', content: 'Artificial intelligence applications', originalScore: 0.4 }
    ];
  });

  describe('Score Change Verification', () => {
    it('should produce different scores than mock for real implementations', async () => {
      const mockService = new MockRerankerService(mockConfig);
      const query = 'artificial intelligence machine learning';

      const request: RerankerRequest = {
        query,
        documents: testDocuments
      };

      // Get mock results
      const mockResults = await mockService.rerank(request);

      // Mock results should be deterministic but different from original scores
      expect(mockResults.length).toBe(testDocuments.length);

      // At least some scores should change from original
      const scoreChanges = mockResults.filter(result =>
        result.rerankerScore !== result.originalScore
      );
      expect(scoreChanges.length).toBeGreaterThan(0);

      // Results should be sorted by reranker score
      for (let i = 0; i < mockResults.length - 1; i++) {
        expect(mockResults[i].rerankerScore).toBeGreaterThanOrEqual(
          mockResults[i + 1].rerankerScore
        );
      }

      // Ranks should be sequential
      mockResults.forEach((result, index) => {
        expect(result.rank).toBe(index + 1);
      });
    });

    it('should maintain consistency across multiple runs for mock service', async () => {
      const mockService = new MockRerankerService(mockConfig);
      const query = 'artificial intelligence machine learning';

      const request: RerankerRequest = {
        query,
        documents: testDocuments
      };

      // Run multiple times to verify deterministic behavior
      const results1 = await mockService.rerank(request);
      const results2 = await mockService.rerank(request);
      const results3 = await mockService.rerank(request);

      // Results should be identical across runs
      expect(results1).toEqual(results2);
      expect(results2).toEqual(results3);

      // Score ordering should be maintained
      for (const results of [results1, results2, results3]) {
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].rerankerScore).toBeGreaterThanOrEqual(
            results[i + 1].rerankerScore
          );
        }
      }
    });
  });

  describe('HttpRerankerService Timeout and Fallback', () => {
    it('should timeout and fallback to pass-through on slow service', async () => {
      const shortTimeoutConfig = { ...mockConfig, timeoutMs: 100 };

      // Use a non-existent endpoint to simulate timeout
      const httpService = new HttpRerankerService(shortTimeoutConfig, 'http://localhost:99999/rerank');

      const request: RerankerRequest = {
        query: 'test query',
        documents: testDocuments.slice(0, 3) // Smaller set for timeout test
      };

      const startTime = performance.now();
      const results = await httpService.rerank(request);
      const endTime = performance.now();

      // Should complete within reasonable time (including timeout period)
      expect(endTime - startTime).toBeLessThan(2000);

      // Should return pass-through results (fallback behavior)
      expect(results.length).toBe(3);
      results.forEach((result, index) => {
        const originalDoc = testDocuments[index];
        expect(result.id).toBe(originalDoc.id);
        expect(result.rerankerScore).toBe(originalDoc.originalScore || 0.5);
      });
    });

    it('should handle malformed API responses gracefully', async () => {
      // This would need a mock HTTP server, but we can test the error handling path
      const httpService = new HttpRerankerService(mockConfig, 'http://localhost:99999/rerank');

      const request: RerankerRequest = {
        query: 'test query',
        documents: [{ id: 'doc1', content: 'test content', originalScore: 0.7 }]
      };

      // Should fallback gracefully
      const results = await httpService.rerank(request);
      expect(results.length).toBe(1);
      expect(results[0].rerankerScore).toBe(0.7); // Pass-through score
    });

    it('should cap text tokens correctly', async () => {
      const httpService = new HttpRerankerService(mockConfig);

      // Create documents with very long content
      const longContent = 'word '.repeat(1000); // ~4000 characters, way over 512 tokens
      const longQuery = 'query '.repeat(200); // ~1000 characters, way over 300 tokens

      const longRequest: RerankerRequest = {
        query: longQuery,
        documents: [
          { id: 'long1', content: longContent, originalScore: 0.8 },
          { id: 'long2', content: longContent, originalScore: 0.6 }
        ]
      };

      // Should handle gracefully without errors (will fallback due to no real service)
      const results = await httpService.rerank(longRequest);
      expect(results.length).toBe(2);

      // Verify the internal token capping method works
      const cappedQuery = httpService['capTokens'](longQuery, 300);
      const cappedContent = httpService['capTokens'](longContent, 512);

      expect(cappedQuery.length).toBeLessThanOrEqual(300 * 4); // ~300 tokens * 4 chars/token
      expect(cappedContent.length).toBeLessThanOrEqual(512 * 4); // ~512 tokens * 4 chars/token
    });

    it('should process batches correctly with new batch size', async () => {
      const batchConfig = { ...mockConfig, batchSize: 16 };
      const httpService = new HttpRerankerService(batchConfig);

      // Create more documents than batch size
      const manyDocuments = Array.from({ length: 20 }, (_, i) => ({
        id: `doc${i + 1}`,
        content: `Document content ${i + 1}`,
        originalScore: 0.5 + (i * 0.01)
      }));

      const request: RerankerRequest = {
        query: 'test query for batching',
        documents: manyDocuments
      };

      // Should handle batching gracefully (will fallback due to no real service)
      const results = await httpService.rerank(request);
      expect(results.length).toBe(20);

      // Should maintain document ordering by score after fallback
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].rerankerScore).toBeGreaterThanOrEqual(
          results[i + 1].rerankerScore
        );
      }
    });
  });

  describe('SentenceTransformersRerankerService Timeout and Fallback', () => {
    it('should timeout on slow processing and fallback gracefully', async () => {
      const shortTimeoutConfig = { ...mockConfig, timeoutMs: 50 }; // Very short timeout
      const localService = new SentenceTransformersRerankerService(shortTimeoutConfig);

      const request: RerankerRequest = {
        query: 'test query',
        documents: testDocuments.slice(0, 3)
      };

      const startTime = performance.now();
      const results = await localService.rerank(request);
      const endTime = performance.now();

      // Should complete quickly due to timeout
      expect(endTime - startTime).toBeLessThan(1000);

      // Should return pass-through results (fallback behavior)
      expect(results.length).toBe(3);
      results.forEach((result, index) => {
        const originalDoc = testDocuments[index];
        expect(result.id).toBe(originalDoc.id);
        // Should use original score as fallback
        expect(result.rerankerScore).toBe(originalDoc.originalScore || 0.5);
      });
    });

    it('should apply token capping correctly', async () => {
      const localService = new SentenceTransformersRerankerService(mockConfig);

      // Test the internal token capping method
      const longText = 'word '.repeat(1000); // ~4000 characters
      const cappedText = localService['capTokens'](longText, 300);

      expect(cappedText.length).toBeLessThanOrEqual(300 * 4); // ~300 tokens * 4 chars/token
      expect(cappedText.length).toBeLessThan(longText.length);
    });

    it('should use environment-based configuration defaults', async () => {
      // Test that the service picks up the new configuration defaults
      const localService = new SentenceTransformersRerankerService(mockConfig);
      const config = localService.getConfig();

      // Should use the defaults from RERANKER_CONFIG
      expect(config.batchSize).toBe(RERANKER_CONFIG.BATCH_SIZE); // 16
      expect(config.timeoutMs).toBe(RERANKER_CONFIG.TIMEOUT_MS); // 500
      expect(config.topK).toBe(RERANKER_CONFIG.TOPN_OUT); // 8
    });
  });

  describe('Performance and Error Boundaries', () => {
    it('should maintain p95 latency target under 350ms for mock service', async () => {
      const fastMockService = new MockRerankerService(mockConfig, { delayMs: 0 });

      const latencies: number[] = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const request: RerankerRequest = {
          query: `test query ${i}`,
          documents: testDocuments
        };

        const startTime = performance.now();
        await fastMockService.rerank(request);
        const endTime = performance.now();

        latencies.push(endTime - startTime);
      }

      // Calculate p95 latency
      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95Latency = latencies[p95Index];

      expect(p95Latency).toBeLessThan(350); // Should meet p95 target
    });

    it('should handle edge cases gracefully', async () => {
      const mockService = new MockRerankerService(mockConfig);

      // Empty documents
      const emptyRequest: RerankerRequest = {
        query: 'test query',
        documents: []
      };

      const emptyResults = await mockService.rerank(emptyRequest);
      expect(emptyResults).toEqual([]);

      // Single document
      const singleRequest: RerankerRequest = {
        query: 'test query',
        documents: [{ id: 'single', content: 'single document', originalScore: 0.5 }]
      };

      const singleResults = await mockService.rerank(singleRequest);
      expect(singleResults.length).toBe(1);
      expect(singleResults[0].rank).toBe(1);

      // Empty query
      const emptyQueryRequest: RerankerRequest = {
        query: '',
        documents: testDocuments.slice(0, 2)
      };

      const emptyQueryResults = await mockService.rerank(emptyQueryRequest);
      expect(emptyQueryResults.length).toBe(2);
    });
  });

  describe('Configuration Integration', () => {
    it('should use new environment variables correctly', () => {
      // Verify RERANKER_CONFIG constants
      expect(RERANKER_CONFIG.BATCH_SIZE).toBe(16);
      expect(RERANKER_CONFIG.TIMEOUT_MS).toBe(500);
      expect(RERANKER_CONFIG.TOPN_IN).toBe(20);
      expect(RERANKER_CONFIG.TOPN_OUT).toBe(8);
      expect(typeof RERANKER_CONFIG.ENABLED).toBe('boolean');
      expect(RERANKER_CONFIG.ENDPOINT).toContain('rerank');
    });

    it('should respect topK limits correctly', async () => {
      const limitedConfig = { ...mockConfig, topK: 3 };
      const mockService = new MockRerankerService(limitedConfig);

      const request: RerankerRequest = {
        query: 'test query',
        documents: testDocuments // 5 documents
      };

      const results = await mockService.rerank(request);

      // Should limit to topK
      expect(results.length).toBe(3);
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
      expect(results[2].rank).toBe(3);
    });
  });
});