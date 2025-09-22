import { guardrailService, SimpleGuardrailService } from '../services/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';

describe('Ask Endpoint Guardrail Integration', () => {
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

  describe('end-to-end guardrail evaluation', () => {
    it('should allow high-confidence queries', () => {
      const searchResults = [
        {
          id: 'doc1',
          score: 0.85,
          payload: {
            content: 'This document contains relevant information about the query topic.',
            tenant: 'test-tenant',
            docId: 'doc1',
            acl: ['user1', 'group1'],
            lang: 'en'
          }
        },
        {
          id: 'doc2',
          score: 0.80,
          payload: {
            content: 'Additional relevant information that supports the answer.',
            tenant: 'test-tenant',
            docId: 'doc2',
            acl: ['user1', 'group1'],
            lang: 'en'
          }
        },
        {
          id: 'doc3',
          score: 0.75,
          payload: {
            content: 'Supporting documentation with more details.',
            tenant: 'test-tenant',
            docId: 'doc3',
            acl: ['user1', 'group1'],
            lang: 'en'
          }
        }
      ];

      const evaluation = service.evaluateAnswerability(
        'What is the main topic?',
        searchResults,
        mockUserContext
      );

      expect(evaluation.isAnswerable).toBe(true);
      expect(evaluation.score.confidence).toBeGreaterThan(0.6);
      expect(evaluation.idkResponse).toBeUndefined();
      expect(evaluation.score.scoreStats.count).toBe(3);
      expect(evaluation.score.scoreStats.mean).toBeCloseTo(0.8, 1);
    });

    it('should block low-confidence queries with IDK response', () => {
      const searchResults = [
        {
          id: 'doc1',
          score: 0.2,
          payload: {
            content: 'Somewhat related but not very relevant content.',
            tenant: 'test-tenant',
            docId: 'doc1',
            acl: ['user1'],
            lang: 'en'
          }
        },
        {
          id: 'doc2',
          score: 0.15,
          payload: {
            content: 'Another document with low relevance.',
            tenant: 'test-tenant',
            docId: 'doc2',
            acl: ['user1'],
            lang: 'en'
          }
        }
      ];

      const evaluation = service.evaluateAnswerability(
        'What is the specific technical detail?',
        searchResults,
        mockUserContext
      );

      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.score.confidence).toBeLessThan(0.6);
      expect(evaluation.idkResponse).toBeDefined();
      expect(['LOW_CONFIDENCE', 'UNCLEAR_ANSWER']).toContain(evaluation.idkResponse?.reasonCode);
      expect(evaluation.idkResponse?.message).toContain("don't have enough confidence");
      expect(evaluation.idkResponse?.suggestions).toBeDefined();
      expect(evaluation.idkResponse?.suggestions?.length).toBeGreaterThan(0);
    });

    it('should block queries with no results', () => {
      const evaluation = service.evaluateAnswerability(
        'Query with no results',
        [],
        mockUserContext
      );

      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.score.confidence).toBe(0);
      expect(evaluation.idkResponse?.reasonCode).toBe('NO_RELEVANT_DOCS');
      expect(evaluation.idkResponse?.message).toContain("couldn't find any relevant information");
      expect(evaluation.idkResponse?.suggestions).toBeDefined();
    });

    it('should block queries with insufficient result count', () => {
      const searchResults = [
        {
          id: 'doc1',
          score: 0.8,
          payload: {
            content: 'Single relevant document.',
            tenant: 'test-tenant',
            docId: 'doc1',
            acl: ['user1'],
            lang: 'en'
          }
        }
      ];

      // Use default config which requires minResultCount: 2
      const defaultUserContext = { ...mockUserContext, tenantId: 'default' };
      const evaluation = service.evaluateAnswerability(
        'Query requiring multiple sources',
        searchResults,
        defaultUserContext
      );

      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.score.scoreStats.count).toBe(1);
    });
  });

  describe('tenant-specific configurations', () => {
    it('should apply strict thresholds for enterprise tenant', () => {
      const searchResults = [
        {
          id: 'doc1',
          score: 0.6,
          payload: { content: 'Moderately relevant content.', tenant: 'enterprise', docId: 'doc1', acl: ['user1'] }
        },
        {
          id: 'doc2',
          score: 0.55,
          payload: { content: 'Another moderately relevant document.', tenant: 'enterprise', docId: 'doc2', acl: ['user1'] }
        }
      ];

      const enterpriseUserContext = { ...mockUserContext, tenantId: 'enterprise' };
      const evaluation = service.evaluateAnswerability(
        'Enterprise query',
        searchResults,
        enterpriseUserContext
      );

      // Should be blocked due to strict enterprise thresholds
      expect(evaluation.isAnswerable).toBe(false);
    });

    it('should apply permissive thresholds for dev tenant', () => {
      const searchResults = [
        {
          id: 'doc1',
          score: 0.4,
          payload: { content: 'Some relevant content.', tenant: 'dev', docId: 'doc1', acl: ['user1'] }
        }
      ];

      const devUserContext = { ...mockUserContext, tenantId: 'dev' };
      const evaluation = service.evaluateAnswerability(
        'Development query',
        searchResults,
        devUserContext
      );

      // Should be answerable due to permissive dev thresholds
      expect(evaluation.isAnswerable).toBe(true);
    });

    it('should allow configuration updates', () => {
      const customConfig = {
        enabled: true,
        minConfidence: 0.9,
        minTopScore: 0.8,
        minMeanScore: 0.7,
        minResultCount: 1
      };

      service.updateTenantConfig('custom-tenant', customConfig);

      const searchResults = [
        {
          id: 'doc1',
          score: 0.75,
          payload: { content: 'Test content.', tenant: 'custom-tenant', docId: 'doc1', acl: ['user1'] }
        }
      ];

      const customUserContext = { ...mockUserContext, tenantId: 'custom-tenant' };
      const evaluation = service.evaluateAnswerability(
        'Custom config test',
        searchResults,
        customUserContext
      );

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

      service.updateTenantConfig('disabled-tenant', disabledConfig);

      const searchResults = [
        {
          id: 'doc1',
          score: 0.1,
          payload: { content: 'Low quality content.', tenant: 'disabled-tenant', docId: 'doc1', acl: ['user1'] }
        }
      ];

      const disabledUserContext = { ...mockUserContext, tenantId: 'disabled-tenant' };
      const evaluation = service.evaluateAnswerability(
        'Query with disabled guardrail',
        searchResults,
        disabledUserContext
      );

      // Should be answerable despite low scores because guardrail is disabled
      expect(evaluation.isAnswerable).toBe(true);
      expect(evaluation.score.reasoning).toContain('Guardrail disabled');
    });
  });

  describe('performance requirements', () => {
    it('should complete evaluation within 50ms target', () => {
      const searchResults = Array.from({ length: 50 }, (_, i) => ({
        id: `doc${i}`,
        score: 0.5 + (Math.random() * 0.3),
        payload: {
          content: `Document ${i} with some relevant content about the topic.`,
          tenant: 'perf-tenant',
          docId: `doc${i}`,
          acl: ['user1']
        }
      }));

      const iterations = 20;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        service.evaluateAnswerability('performance test query', searchResults, mockUserContext);
        const duration = performance.now() - startTime;
        times.push(duration);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      expect(avgTime).toBeLessThan(50);
      expect(maxTime).toBeLessThan(100); // Allow some variance
    });

    it('should scale well with large result sets', () => {
      const smallResults = Array.from({ length: 10 }, (_, i) => ({
        id: `doc${i}`,
        score: Math.random(),
        payload: { content: `Content ${i}`, tenant: 'test', docId: `doc${i}`, acl: ['user1'] }
      }));

      const largeResults = Array.from({ length: 100 }, (_, i) => ({
        id: `doc${i}`,
        score: Math.random(),
        payload: { content: `Content ${i}`, tenant: 'test', docId: `doc${i}`, acl: ['user1'] }
      }));

      // Time small evaluation
      const smallStart = performance.now();
      service.evaluateAnswerability('test', smallResults, mockUserContext);
      const smallTime = performance.now() - smallStart;

      // Time large evaluation
      const largeStart = performance.now();
      service.evaluateAnswerability('test', largeResults, mockUserContext);
      const largeTime = performance.now() - largeStart;

      // Should scale reasonably (not more than 5x slower for 10x data)
      expect(largeTime / smallTime).toBeLessThan(5);
    });
  });

  describe('statistical analysis accuracy', () => {
    it('should calculate correct statistical measures', () => {
      const searchResults = [
        { id: 'doc1', score: 0.9, payload: { content: 'test1' } },
        { id: 'doc2', score: 0.8, payload: { content: 'test2' } },
        { id: 'doc3', score: 0.7, payload: { content: 'test3' } },
        { id: 'doc4', score: 0.6, payload: { content: 'test4' } },
        { id: 'doc5', score: 0.5, payload: { content: 'test5' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', searchResults, mockUserContext);

      expect(evaluation.score.scoreStats.mean).toBeCloseTo(0.7, 10);
      expect(evaluation.score.scoreStats.max).toBe(0.9);
      expect(evaluation.score.scoreStats.min).toBe(0.5);
      expect(evaluation.score.scoreStats.count).toBe(5);
    });

    it('should handle edge cases in statistical calculation', () => {
      // Test with identical scores
      const identicalResults = [
        { id: 'doc1', score: 0.7, payload: { content: 'test1' } },
        { id: 'doc2', score: 0.7, payload: { content: 'test2' } },
        { id: 'doc3', score: 0.7, payload: { content: 'test3' } }
      ];

      const evaluation = service.evaluateAnswerability('test query', identicalResults, mockUserContext);

      expect(evaluation.score.scoreStats.mean).toBeCloseTo(0.7, 10);
      expect(evaluation.score.scoreStats.max).toBeCloseTo(0.7, 10);
      expect(evaluation.score.scoreStats.min).toBeCloseTo(0.7, 10);
      // High consistency should boost confidence
      expect(evaluation.score.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('IDK response generation', () => {
    it('should provide helpful suggestions for no results', () => {
      const evaluation = service.evaluateAnswerability('completely unrelated query', [], mockUserContext);

      expect(evaluation.idkResponse?.suggestions).toBeDefined();
      expect(evaluation.idkResponse?.suggestions?.length).toBeGreaterThan(0);
      expect(evaluation.idkResponse?.suggestions?.[0]).toContain('rephrasing');
    });

    it('should provide different suggestions for low confidence', () => {
      const lowConfidenceResults = [
        { id: 'doc1', score: 0.1, payload: { content: 'barely relevant' } },
        { id: 'doc2', score: 0.15, payload: { content: 'also barely relevant' } }
      ];

      const evaluation = service.evaluateAnswerability('low confidence query', lowConfidenceResults, mockUserContext);

      expect(evaluation.idkResponse?.suggestions).toBeDefined();
      expect(evaluation.idkResponse?.suggestions?.[0]).toContain('specific');
    });

    it('should customize IDK messages based on failure reason', () => {
      // Test no results case
      const noResultsEval = service.evaluateAnswerability('no results query', [], mockUserContext);
      expect(noResultsEval.idkResponse?.reasonCode).toBe('NO_RELEVANT_DOCS');

      // Test low confidence case
      const lowConfidenceResults = [
        { id: 'doc1', score: 0.1, payload: { content: 'test' } },
        { id: 'doc2', score: 0.12, payload: { content: 'test' } }
      ];
      const lowConfidenceEval = service.evaluateAnswerability('low conf query', lowConfidenceResults, mockUserContext);
      expect(['LOW_CONFIDENCE', 'UNCLEAR_ANSWER']).toContain(lowConfidenceEval.idkResponse?.reasonCode);

      // Different messages for different reasons
      expect(noResultsEval.idkResponse?.message).not.toBe(lowConfidenceEval.idkResponse?.message);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle mixed-quality results appropriately', () => {
      const mixedResults = [
        { id: 'doc1', score: 0.9, payload: { content: 'Highly relevant document' } },
        { id: 'doc2', score: 0.3, payload: { content: 'Somewhat related' } },
        { id: 'doc3', score: 0.1, payload: { content: 'Barely related' } },
        { id: 'doc4', score: 0.8, payload: { content: 'Another good match' } }
      ];

      const evaluation = service.evaluateAnswerability('mixed results query', mixedResults, mockUserContext);

      // Should consider the presence of high-quality results
      expect(evaluation.score.scoreStats.max).toBe(0.9);
      expect(evaluation.score.scoreStats.count).toBe(4);

      // Decision depends on whether the high scores outweigh the variance
      if (evaluation.isAnswerable) {
        expect(evaluation.score.confidence).toBeGreaterThan(0.6);
      } else {
        expect(evaluation.idkResponse).toBeDefined();
      }
    });

    it('should handle queries typical of out-of-domain dataset', () => {
      // Simulate results for queries like "What is the weather today?"
      const irrelevantResults = [
        { id: 'doc1', score: 0.05, payload: { content: 'Unrelated business document' } },
        { id: 'doc2', score: 0.03, payload: { content: 'Another unrelated document' } }
      ];

      const evaluation = service.evaluateAnswerability(
        'What is the weather like today?',
        irrelevantResults,
        mockUserContext
      );

      expect(evaluation.isAnswerable).toBe(false);
      expect(evaluation.score.confidence).toBeLessThan(0.3);
      expect(evaluation.idkResponse?.reasonCode).toBe('LOW_CONFIDENCE');
    });

    it('should handle empty content gracefully', () => {
      const resultsWithEmptyContent = [
        { id: 'doc1', score: 0.8, payload: { content: '' } },
        { id: 'doc2', score: 0.75, payload: { content: null } },
        { id: 'doc3', score: 0.7, payload: {} }
      ];

      const evaluation = service.evaluateAnswerability(
        'Query with empty content',
        resultsWithEmptyContent,
        mockUserContext
      );

      expect(evaluation).toBeDefined();
      expect(evaluation.score.scoreStats.count).toBe(3);
      // Should still make a decision based on scores
    });
  });
});

describe('Guardrail Performance Benchmarks', () => {
  const service = new SimpleGuardrailService();
  const mockUserContext: UserContext = {
    id: 'benchmark-user',
    groupIds: ['benchmark-group'],
    tenantId: 'benchmark-tenant'
  };

  it('should meet performance targets for various result set sizes', () => {
    const testSizes = [1, 5, 10, 25, 50, 100];

    for (const size of testSizes) {
      const results = Array.from({ length: size }, (_, i) => ({
        id: `doc${i}`,
        score: Math.random(),
        payload: { content: `Content ${i}` }
      }));

      const startTime = performance.now();
      const evaluation = service.evaluateAnswerability('benchmark query', results, mockUserContext);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(50);
      expect(evaluation).toBeDefined();

      console.log(`Size ${size}: ${duration.toFixed(2)}ms`);
    }
  });
});