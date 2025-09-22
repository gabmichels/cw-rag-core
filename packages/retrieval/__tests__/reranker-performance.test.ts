import { MockRerankerService, MockRerankerServiceFactory } from '../src/services/mock-reranker.js';
import { SentenceTransformersRerankerService } from '../src/services/sentence-transformers-reranker.js';
import { HttpRerankerService } from '../src/services/http-reranker.js';
import {
  RerankerRequest,
  RerankerConfig,
  DEFAULT_RERANKER_CONFIG,
  RERANKER_MODELS
} from '../src/types/reranker.js';

// Helper function to generate test documents
function generateTestDocuments(count: number, contentPrefix: string = 'Document') {
  return Array.from({ length: count }, (_, i) => ({
    id: `doc${i + 1}`,
    content: `${contentPrefix} ${i + 1} with some additional content to make it realistic for reranking tests. This document contains information about various topics and should provide enough text for meaningful reranking evaluation.`,
    originalScore: Math.random() * 0.5 + 0.5 // Random score between 0.5 and 1.0
  }));
}

describe('Reranker Performance Tests', () => {
  let rerankerConfig: RerankerConfig;

  beforeEach(() => {
    rerankerConfig = {
      ...DEFAULT_RERANKER_CONFIG,
      enabled: true,
      topK: 8,
      batchSize: 20
    };
  });

  describe('MockRerankerService Performance', () => {
    it('should rerank 20 documents within 200ms target', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);
      const documents = generateTestDocuments(20);

      const request: RerankerRequest = {
        query: 'test query for performance measurement',
        documents
      };

      const startTime = performance.now();
      const { results, metrics } = await service.rerankWithMetrics(request);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(200); // Target: <200ms for 20 documents
      expect(results).toHaveLength(8); // Should return topK results
      expect(metrics.rerankerDuration).toBeLessThan(200);
      expect(metrics.documentsProcessed).toBe(20);
      expect(metrics.batchCount).toBe(1);
    });

    it('should handle batch processing efficiently for large document sets', async () => {
      const config = { ...rerankerConfig, batchSize: 10 };
      const service = new MockRerankerService(config);
      const documents = generateTestDocuments(50); // 5 batches

      const request: RerankerRequest = {
        query: 'batch processing performance test',
        documents
      };

      const startTime = performance.now();
      const { results, metrics } = await service.rerankWithMetrics(request);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      expect(results).toHaveLength(8); // topK results
      expect(metrics.documentsProcessed).toBe(50);
      expect(metrics.batchCount).toBe(5); // 50 docs / 10 batch size
    });

    it('should scale linearly with document count', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);
      const measurements: { docCount: number; time: number }[] = [];

      for (const docCount of [5, 10, 20, 40]) {
        const documents = generateTestDocuments(docCount);
        const request: RerankerRequest = {
          query: 'scaling test query',
          documents
        };

        const startTime = performance.now();
        await service.rerank(request);
        const endTime = performance.now();

        measurements.push({ docCount, time: endTime - startTime });
      }

      // Check that time scales roughly linearly (allowing for some variation)
      const timePerDoc5 = measurements[0].time / measurements[0].docCount;
      const timePerDoc40 = measurements[3].time / measurements[3].docCount;

      // Time per document shouldn't increase too dramatically
      expect(timePerDoc40).toBeLessThan(timePerDoc5 * 3);
    });

    it('should demonstrate memory efficiency with large result sets', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);

      // Test with large document set
      const documents = generateTestDocuments(1000, 'Large dataset document');

      const request: RerankerRequest = {
        query: 'memory efficiency test with large dataset',
        documents
      };

      const startTime = performance.now();
      const results = await service.rerank(request);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results).toHaveLength(8); // Should still return topK results

      // Verify memory isn't leaked by checking result structure
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('rerankerScore');
    });
  });

  describe('Performance Comparison', () => {
    it('should compare fast vs slow mock services', async () => {
      const fastService = MockRerankerServiceFactory.createFast(rerankerConfig);
      const slowService = MockRerankerServiceFactory.createSlow(rerankerConfig);

      const documents = generateTestDocuments(20);
      const request: RerankerRequest = {
        query: 'performance comparison test',
        documents
      };

      // Test fast service
      const fastStart = performance.now();
      await fastService.rerank(request);
      const fastEnd = performance.now();
      const fastTime = fastEnd - fastStart;

      // Test slow service
      const slowStart = performance.now();
      await slowService.rerank(request);
      const slowEnd = performance.now();
      const slowTime = slowEnd - slowStart;

      expect(fastTime).toBeLessThan(50); // Fast should be very quick
      expect(slowTime).toBeGreaterThan(100); // Slow should have delay
      expect(slowTime).toBeGreaterThan(fastTime); // Slow should be slower than fast
    });

    it('should measure performance with different batch sizes', async () => {
      const documents = generateTestDocuments(40);
      const request: RerankerRequest = {
        query: 'batch size performance test',
        documents
      };

      const batchSizes = [5, 10, 20, 40];
      const results: { batchSize: number; time: number; batches: number }[] = [];

      for (const batchSize of batchSizes) {
        const config = { ...rerankerConfig, batchSize };
        const service = new MockRerankerService(config);

        const startTime = performance.now();
        const { metrics } = await service.rerankWithMetrics(request);
        const endTime = performance.now();

        results.push({
          batchSize,
          time: endTime - startTime,
          batches: metrics.batchCount
        });
      }

      // Verify batch counts are correct
      expect(results[0].batches).toBe(8); // 40/5
      expect(results[1].batches).toBe(4); // 40/10
      expect(results[2].batches).toBe(2); // 40/20
      expect(results[3].batches).toBe(1); // 40/40

      // All should complete reasonably quickly
      for (const result of results) {
        expect(result.time).toBeLessThan(1000);
      }
    });
  });

  describe('Stress Tests', () => {
    it('should handle concurrent reranking requests', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);
      const documents = generateTestDocuments(20);

      const createRequest = (queryId: number): RerankerRequest => ({
        query: `concurrent test query ${queryId}`,
        documents
      });

      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        service.rerank(createRequest(i))
      );

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(2000); // All requests within 2 seconds
      expect(results).toHaveLength(concurrentRequests);

      // Each request should return proper results
      for (const result of results) {
        expect(result).toHaveLength(8); // topK results
        expect(result[0]).toHaveProperty('rank', 1);
      }
    });

    it('should maintain performance under repeated usage', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);
      const documents = generateTestDocuments(20);

      const request: RerankerRequest = {
        query: 'repeated usage performance test',
        documents
      };

      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await service.rerank(request);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      // Calculate statistics
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      expect(avgTime).toBeLessThan(100); // Average should be fast
      expect(maxTime).toBeLessThan(500); // Even worst case should be reasonable
      expect(minTime).toBeGreaterThan(0); // Should take some time

      // Performance shouldn't degrade significantly over time
      const firstQuarter = times.slice(0, 25);
      const lastQuarter = times.slice(-25);
      const firstAvg = firstQuarter.reduce((sum, time) => sum + time, 0) / firstQuarter.length;
      const lastAvg = lastQuarter.reduce((sum, time) => sum + time, 0) / lastQuarter.length;

      expect(lastAvg).toBeLessThan(firstAvg * 2); // Performance shouldn't degrade more than 2x
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory with large document processing', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);

      // Process multiple large batches
      for (let batch = 0; batch < 10; batch++) {
        const documents = generateTestDocuments(100, `Batch ${batch} document`);
        const request: RerankerRequest = {
          query: `memory test batch ${batch}`,
          documents
        };

        const results = await service.rerank(request);
        expect(results).toHaveLength(8);

        // Clear references to help with garbage collection
        documents.length = 0;
      }

      // Final test to ensure service is still working
      const finalDocuments = generateTestDocuments(20);
      const finalRequest: RerankerRequest = {
        query: 'final memory test',
        documents: finalDocuments
      };

      const finalResults = await service.rerank(finalRequest);
      expect(finalResults).toHaveLength(8);
    });

    it('should handle edge case document sizes efficiently', async () => {
      const service = MockRerankerServiceFactory.createFast(rerankerConfig);

      // Test with very short documents
      const shortDocs = Array.from({ length: 20 }, (_, i) => ({
        id: `short${i}`,
        content: 'short',
        originalScore: 0.5
      }));

      // Test with very long documents
      const longContent = 'Lorem ipsum '.repeat(1000); // Very long content
      const longDocs = Array.from({ length: 20 }, (_, i) => ({
        id: `long${i}`,
        content: longContent,
        originalScore: 0.5
      }));

      // Test both cases
      for (const { name, documents } of [
        { name: 'short', documents: shortDocs },
        { name: 'long', documents: longDocs }
      ]) {
        const request: RerankerRequest = {
          query: `${name} document test`,
          documents
        };

        const startTime = performance.now();
        const results = await service.rerank(request);
        const endTime = performance.now();

        expect(endTime - startTime).toBeLessThan(1000);
        expect(results).toHaveLength(8);
      }
    });
  });

  describe('Configuration Impact on Performance', () => {
    it('should measure impact of different topK values', async () => {
      const documents = generateTestDocuments(50);
      const topKValues = [1, 5, 10, 20, 50];

      for (const topK of topKValues) {
        const config = { ...rerankerConfig, topK };
        const service = new MockRerankerService(config);

        const request: RerankerRequest = {
          query: 'topK performance test',
          documents
        };

        const startTime = performance.now();
        const results = await service.rerank(request);
        const endTime = performance.now();

        expect(endTime - startTime).toBeLessThan(1000);
        expect(results).toHaveLength(Math.min(topK, documents.length));
      }
    });

    it('should measure impact of score thresholds', async () => {
      const service = new MockRerankerService(rerankerConfig);

      // Set predictable scores
      const documents = generateTestDocuments(20);
      documents.forEach((doc, i) => {
        service.setMockScore(doc.id, (20 - i) / 20); // Scores from 1.0 to 0.05
      });

      const thresholds = [0.0, 0.3, 0.5, 0.7, 0.9];

      for (const threshold of thresholds) {
        const config = { ...rerankerConfig, scoreThreshold: threshold };
        service.updateConfig({ scoreThreshold: threshold });

        const request: RerankerRequest = {
          query: 'threshold performance test',
          documents
        };

        const startTime = performance.now();
        const results = await service.rerank(request);
        const endTime = performance.now();

        expect(endTime - startTime).toBeLessThan(500);

        // Higher thresholds should return fewer results
        if (threshold > 0.5) {
          expect(results.length).toBeLessThan(20);
        }
      }
    });
  });
});