import { guardrailService, SimpleGuardrailService } from '../services/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';

describe('SimpleGuardrailService', () => {
  let service: SimpleGuardrailService;
  let mockUserContext: UserContext;

  beforeEach(() => {
    service = new SimpleGuardrailService();
    mockUserContext = {
      id: 'test-user',
      groupIds: ['group1'],
      tenantId: 'test-tenant'
    };
  });

  describe('calculateScore', () => {
    it('should return zero confidence for empty results', () => {
      const evaluation = service.evaluateAnswerability('test query', [], mockUserContext);

      expect(evaluation.score.confidence).toBe(0);
      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.score.reasoning).toContain('No search results');
    });

    it('should calculate confidence for single high-score result', () => {
      const searchResults = [{ score: 0.9, id: 'doc1', payload: { content: 'test' } }];
      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.score.confidence).toBeGreaterThan(0.7);
      expect(evaluation.score.scoreStats.max).toBe(0.9);
      expect(evaluation.score.scoreStats.count).toBe(1);
    });

    it('should calculate confidence for multiple consistent results', () => {
      const searchResults = [
        { score: 0.8, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.85, id: 'doc2', payload: { content: 'test2' } },
        { score: 0.82, id: 'doc3', payload: { content: 'test3' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.score.confidence).toBeGreaterThan(0.6);
      expect(evaluation.score.scoreStats.mean).toBeCloseTo(0.823, 2);
      expect(evaluation.isAnswerable).toBe(true);
    });

    it('should have lower confidence for inconsistent results', () => {
      const searchResults = [
        { score: 0.9, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.1, id: 'doc2', payload: { content: 'test2' } },
        { score: 0.2, id: 'doc3', payload: { content: 'test3' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.score.confidence).toBeLessThan(0.6);
      expect(evaluation.score.scoreStats.max).toBe(0.9);
      expect(evaluation.score.scoreStats.min).toBe(0.1);
    });
  });

  describe('threshold application', () => {
    it('should block queries below confidence threshold', () => {
      const searchResults = [
        { score: 0.3, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.2, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.idkResponse).toBeDefined();
      expect(evaluation.idkResponse?.reasonCode).toBe('LOW_CONFIDENCE');
    });

    it('should allow queries above all thresholds', () => {
      const searchResults = [
        { score: 0.8, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.7, id: 'doc2', payload: { content: 'test2' } },
        { score: 0.6, id: 'doc3', payload: { content: 'test3' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.isAnswerable).toBe(true);
      expect(evaluation.idkResponse).toBeUndefined();
    });

    it('should block queries with insufficient result count', () => {
      const searchResults = [
        { score: 0.9, id: 'doc1', payload: { content: 'test1' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      // With default config requiring minResultCount: 2, this should be blocked
      expect(evaluation.isAnswerable).toBe(false);
    });
  });

  describe('IDK response generation', () => {
    it('should generate appropriate IDK response for no results', () => {
      const evaluation = service.evaluateAnswerability('test query', [], mockUserContext);

      expect(evaluation.idkResponse?.reasonCode).toBe('NO_RELEVANT_DOCS');
      expect(evaluation.idkResponse?.message).toContain("couldn't find any relevant information");
      expect(evaluation.idkResponse?.suggestions).toBeDefined();
      expect(evaluation.idkResponse?.suggestions?.length).toBeGreaterThan(0);
    });

    it('should generate appropriate IDK response for low confidence', () => {
      const searchResults = [
        { score: 0.1, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.15, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.idkResponse?.reasonCode).toBe('LOW_CONFIDENCE');
      expect(evaluation.idkResponse?.message).toContain("don't have enough confidence");
      expect(evaluation.idkResponse?.suggestions).toBeDefined();
    });
  });

  describe('tenant configuration', () => {
    it('should use default config for unknown tenant', () => {
      const mockUserContextUnknown = { ...mockUserContext, tenantId: 'unknown-tenant' };
      const searchResults = [
        { score: 0.5, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.4, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContextUnknown);

      // Should use default moderate threshold
      expect(evaluation).toBeDefined();
    });

    it('should allow config updates', () => {
      const customConfig = {
        enabled: true,
        minConfidence: 0.9,
        minTopScore: 0.8,
        minMeanScore: 0.7,
        minResultCount: 1
      };

      service.updateTenantConfig('test-tenant', customConfig);

      const searchResults = [
        { score: 0.75, id: 'doc1', payload: { content: 'test1' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      // Should be blocked due to strict custom config
      expect(evaluation.isAnswerable).toBe(false);
    });

    it('should bypass guardrail when disabled', () => {
      const disabledConfig = {
        enabled: false,
        minConfidence: 0.9,
        minTopScore: 0.9,
        minMeanScore: 0.9,
        minResultCount: 10
      };

      service.updateTenantConfig('test-tenant', disabledConfig);

      const searchResults = [
        { score: 0.1, id: 'doc1', payload: { content: 'test1' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      // Should be answerable despite low scores because guardrail is disabled
      expect(evaluation.isAnswerable).toBe(true);
      expect(evaluation.score.reasoning).toContain('Guardrail disabled');
    });
  });

  describe('performance', () => {
    it('should complete evaluation within 50ms for typical results', () => {
      const searchResults = Array.from({ length: 10 }, (_, i) => ({
        score: 0.5 + (i * 0.05),
        id: `doc${i}`,
        payload: { content: `test content ${i}` }
      }));

      const startTime = performance.now();
      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
      expect(evaluation).toBeDefined();
    });

    it('should handle large result sets efficiently', () => {
      const searchResults = Array.from({ length: 100 }, (_, i) => ({
        score: Math.random(),
        id: `doc${i}`,
        payload: { content: `test content ${i}` }
      }));

      const startTime = performance.now();
      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100); // Allow slightly more time for large sets
      expect(evaluation).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle results with missing scores', () => {
      const searchResults = [
        { id: 'doc1', payload: { content: 'test1' } }, // No score
        { score: 0.7, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation).toBeDefined();
      expect(evaluation.score.scoreStats.count).toBe(2);
    });

    it('should handle results with null/undefined content', () => {
      const searchResults = [
        { score: 0.8, id: 'doc1', payload: { content: null } },
        { score: 0.7, id: 'doc2', payload: {} }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation).toBeDefined();
      expect(evaluation.score.confidence).toBeGreaterThan(0);
    });

    it('should handle very high scores', () => {
      const searchResults = [
        { score: 1.5, id: 'doc1', payload: { content: 'test1' } }, // Score > 1
        { score: 0.95, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.score.confidence).toBeLessThanOrEqual(1.0);
      expect(evaluation).toBeDefined();
    });
  });
});

describe('Guardrail Integration', () => {
  describe('algorithm scoring', () => {
    it('should calculate statistical score correctly', () => {
      const service = new SimpleGuardrailService();
      const results = [
        { score: 0.8, id: 'doc1', payload: { content: 'test1' } },
        { score: 0.85, id: 'doc2', payload: { content: 'test2' } },
        { score: 0.82, id: 'doc3', payload: { content: 'test3' } }
      ];

      const evaluation = service.evaluateAnswerability('test', results, mockUserContext);

      expect(evaluation.score.scoreStats.mean).toBeCloseTo(0.823, 2);
      expect(evaluation.score.scoreStats.max).toBe(0.85);
      expect(evaluation.score.scoreStats.min).toBe(0.8);
    });

    it('should handle score normalization', () => {
      const service = new SimpleGuardrailService();
      const results = [
        { score: 2.0, id: 'doc1', payload: { content: 'test1' } }, // Abnormally high
        { score: 0.5, id: 'doc2', payload: { content: 'test2' } }
      ];

      const evaluation = service.evaluateAnswerability('test', results, mockUserContext);

      // Should handle high scores gracefully
      expect(evaluation.score.confidence).toBeLessThanOrEqual(1.0);
      expect(evaluation.score.confidence).toBeGreaterThan(0);
    });
  });

  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = {
      id: 'test-user',
      groupIds: ['group1'],
      tenantId: 'test-tenant'
    };
  });
});