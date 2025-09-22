import { MockRerankerService, MockRerankerServiceFactory } from '../src/services/mock-reranker.js';
import {
  RerankerRequest,
  RerankerResult,
  RerankerConfig,
  RERANKER_MODELS,
  DEFAULT_RERANKER_CONFIG
} from '../src/types/reranker.js';

describe('MockRerankerService', () => {
  let mockConfig: RerankerConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_RERANKER_CONFIG,
      enabled: true
    };
  });

  describe('Basic Functionality', () => {
    it('should create a mock reranker service', () => {
      const service = new MockRerankerService(mockConfig);
      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service.getConfig()).toEqual(mockConfig);
    });

    it('should return pass-through results when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const service = new MockRerankerService(disabledConfig);

      const request: RerankerRequest = {
        query: 'test query',
        documents: [
          { id: 'doc1', content: 'First document', originalScore: 0.8 },
          { id: 'doc2', content: 'Second document', originalScore: 0.6 }
        ]
      };

      const results = await service.rerank(request);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: 'doc1',
        score: 0.8,
        rerankerScore: 0.8,
        rank: 1
      });
      expect(results[1]).toMatchObject({
        id: 'doc2',
        score: 0.6,
        rerankerScore: 0.6,
        rank: 2
      });
    });

    it('should rerank documents by relevance when enabled', async () => {
      const service = new MockRerankerService(mockConfig);

      const request: RerankerRequest = {
        query: 'artificial intelligence',
        documents: [
          { id: 'doc1', content: 'This is about cats and dogs', originalScore: 0.9 },
          { id: 'doc2', content: 'Artificial intelligence and machine learning', originalScore: 0.5 },
          { id: 'doc3', content: 'AI systems are transforming technology', originalScore: 0.7 }
        ]
      };

      const results = await service.rerank(request);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('doc2'); // Should rank highest due to query match
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
      expect(results[2].rank).toBe(3);

      // Scores should be recalculated, not just pass-through
      expect(results[0].rerankerScore).not.toBe(0.5);
    });

    it('should apply score threshold filtering', async () => {
      const config = { ...mockConfig, scoreThreshold: 0.7 };
      const service = new MockRerankerService(config);

      // Set mock scores to control the test
      service.setMockScores({
        'doc1': 0.9,
        'doc2': 0.5, // Below threshold
        'doc3': 0.8
      });

      const request: RerankerRequest = {
        query: 'test',
        documents: [
          { id: 'doc1', content: 'Document 1' },
          { id: 'doc2', content: 'Document 2' },
          { id: 'doc3', content: 'Document 3' }
        ]
      };

      const results = await service.rerank(request);

      expect(results).toHaveLength(2);
      expect(results.find(r => r.id === 'doc2')).toBeUndefined();
    });

    it('should apply topK filtering', async () => {
      const config = { ...mockConfig, topK: 2 };
      const service = new MockRerankerService(config);

      const request: RerankerRequest = {
        query: 'test',
        documents: [
          { id: 'doc1', content: 'Document 1' },
          { id: 'doc2', content: 'Document 2' },
          { id: 'doc3', content: 'Document 3' },
          { id: 'doc4', content: 'Document 4' }
        ]
      };

      const results = await service.rerank(request);

      expect(results).toHaveLength(2);
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
    });
  });

  describe('Performance Metrics', () => {
    it('should provide performance metrics', async () => {
      const service = new MockRerankerService(mockConfig, { delayMs: 10 });

      const request: RerankerRequest = {
        query: 'test',
        documents: [
          { id: 'doc1', content: 'Document 1' },
          { id: 'doc2', content: 'Document 2' }
        ]
      };

      const { results, metrics } = await service.rerankWithMetrics(request);

      expect(results).toHaveLength(2);
      expect(metrics.rerankerDuration).toBeGreaterThanOrEqual(8);
      expect(metrics.documentsProcessed).toBe(2);
      expect(metrics.batchCount).toBe(1);
      expect(metrics.avgScoreImprovement).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Mock Configuration', () => {
    it('should use predefined mock scores', async () => {
      const service = new MockRerankerService(mockConfig);
      service.setMockScore('doc1', 0.95);
      service.setMockScore('doc2', 0.75);

      const request: RerankerRequest = {
        query: 'test',
        documents: [
          { id: 'doc1', content: 'Document 1' },
          { id: 'doc2', content: 'Document 2' }
        ]
      };

      const results = await service.rerank(request);

      expect(results[0].id).toBe('doc1');
      expect(results[0].rerankerScore).toBe(0.95);
      expect(results[1].id).toBe('doc2');
      expect(results[1].rerankerScore).toBe(0.75);
    });

    it('should simulate failures when configured', async () => {
      const service = new MockRerankerService(mockConfig, { failureRate: 1.0 });

      const request: RerankerRequest = {
        query: 'test',
        documents: [{ id: 'doc1', content: 'Document 1' }]
      };

      await expect(service.rerank(request)).rejects.toThrow('Mock reranker failure');
    });

    it('should simulate processing delay', async () => {
      const service = new MockRerankerService(mockConfig, { delayMs: 50 });

      const request: RerankerRequest = {
        query: 'test',
        documents: [{ id: 'doc1', content: 'Document 1' }]
      };

      const startTime = Date.now();
      await service.rerank(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(50);
    });

    it('should clear mock scores', () => {
      const service = new MockRerankerService(mockConfig);
      service.setMockScore('doc1', 0.9);
      expect(service['mockScores'].size).toBe(1);

      service.clearMockScores();
      expect(service['mockScores'].size).toBe(0);
    });
  });

  describe('Health and Models', () => {
    it('should always report as healthy', async () => {
      const service = new MockRerankerService(mockConfig);
      expect(await service.isHealthy()).toBe(true);
    });

    it('should return supported models', () => {
      const service = new MockRerankerService(mockConfig);
      const models = service.getSupportedModels();

      expect(models).toContain(RERANKER_MODELS.BGE_RERANKER_LARGE.name);
      expect(models).toContain(RERANKER_MODELS.BGE_RERANKER_BASE.name);
    });
  });

  describe('Factory Methods', () => {
    it('should create fast mock service', () => {
      const service = MockRerankerServiceFactory.createFast(mockConfig);
      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service['delayMs']).toBe(0);
    });

    it('should create slow mock service', () => {
      const service = MockRerankerServiceFactory.createSlow(mockConfig);
      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service['delayMs']).toBe(100);
    });

    it('should create unreliable mock service', () => {
      const service = MockRerankerServiceFactory.createUnreliable(mockConfig);
      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service['failureRate']).toBe(0.3);
      expect(service['delayMs']).toBe(50);
    });

    it('should create mock service with predefined scores', () => {
      const scores = { 'doc1': 0.9, 'doc2': 0.7 };
      const service = MockRerankerServiceFactory.createWithPredefinedScores(mockConfig, scores);

      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service['mockScores'].get('doc1')).toBe(0.9);
      expect(service['mockScores'].get('doc2')).toBe(0.7);
    });

    it('should create perfect reranker', () => {
      const service = MockRerankerServiceFactory.createPerfectReranker(mockConfig);
      expect(service).toBeInstanceOf(MockRerankerService);
      expect(service['delayMs']).toBe(10);
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration', () => {
      const service = new MockRerankerService(mockConfig);
      const newConfig = { topK: 5, scoreThreshold: 0.8 };

      service.updateConfig(newConfig);
      const updatedConfig = service.getConfig();

      expect(updatedConfig.topK).toBe(5);
      expect(updatedConfig.scoreThreshold).toBe(0.8);
      expect(updatedConfig.enabled).toBe(true); // Should preserve other settings
    });

    it('should update failure rate', () => {
      const service = new MockRerankerService(mockConfig);
      service.setFailureRate(0.5);
      expect(service['failureRate']).toBe(0.5);
    });

    it('should update delay', () => {
      const service = new MockRerankerService(mockConfig);
      service.setDelay(100);
      expect(service['delayMs']).toBe(100);
    });
  });
});