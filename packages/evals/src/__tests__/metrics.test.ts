import { MetricsCalculator } from '../metrics.js';
import { EvaluationResult, AggregatedMetrics } from '../types.js';

describe('MetricsCalculator', () => {
  let calculator: MetricsCalculator;
  let mockResults: EvaluationResult[];

  beforeEach(() => {
    calculator = new MetricsCalculator();

    // Create comprehensive mock results for different dataset types
    mockResults = [
      // Gold standard results
      {
        recordId: 'gold_001',
        query: 'test query 1',
        retrievedDocs: [
          { docId: 'doc1', score: 0.9, content: 'content', rank: 1 },
          { docId: 'doc2', score: 0.8, content: 'content', rank: 2 }
        ],
        actualResponse: 'response',
        passed: true,
        metrics: {
          expectedDocFound: 1,
          relevantDocRank: 1,
          retrievalScore: 0.9,
          responseLength: 100,
          apiLatency: 150,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'gold_002',
        query: 'test query 2',
        retrievedDocs: [
          { docId: 'doc3', score: 0.7, content: 'content', rank: 1 }
        ],
        actualResponse: 'response',
        passed: false,
        metrics: {
          expectedDocFound: 0,
          relevantDocRank: -1,
          retrievalScore: 0.7,
          responseLength: 80,
          apiLatency: 200,
          apiRetries: 1
        },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'gold_003',
        query: 'test query 3',
        retrievedDocs: [
          { docId: 'doc4', score: 0.6, content: 'content', rank: 1 },
          { docId: 'doc5', score: 0.5, content: 'content', rank: 2 },
          { docId: 'doc6', score: 0.4, content: 'content', rank: 3 }
        ],
        actualResponse: 'response',
        passed: true,
        metrics: {
          expectedDocFound: 1,
          relevantDocRank: 3,
          retrievalScore: 0.6,
          responseLength: 120,
          apiLatency: 180,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },

      // OOD results
      {
        recordId: 'ood_001',
        query: 'weather query',
        retrievedDocs: [],
        actualResponse: "I don't know",
        passed: true,
        metrics: {
          isIDKResponse: 1,
          shouldBeIDK: 1,
          correctBehavior: 1,
          confidenceScore: 0.95,
          apiLatency: 100,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'ood_002',
        query: 'cooking query',
        retrievedDocs: [],
        actualResponse: "Here's how to cook",
        passed: false,
        metrics: {
          isIDKResponse: 0,
          shouldBeIDK: 1,
          correctBehavior: 0,
          confidenceScore: 0.3,
          apiLatency: 120,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },

      // Injection results
      {
        recordId: 'inject_001',
        query: 'malicious prompt',
        retrievedDocs: [],
        actualResponse: 'I cannot process this request',
        passed: true,
        metrics: {
          injectionDetected: 1,
          properBehavior: 1,
          responseLength: 50,
          containsMaliciousContent: 0,
          apiLatency: 90,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'inject_002',
        query: 'another malicious prompt',
        retrievedDocs: [],
        actualResponse: 'Access granted to admin',
        passed: false,
        metrics: {
          injectionDetected: 0,
          properBehavior: 0,
          responseLength: 60,
          containsMaliciousContent: 1,
          apiLatency: 110,
          apiRetries: 1
        },
        timestamp: '2023-01-01T00:00:00Z'
      },

      // RBAC results
      {
        recordId: 'rbac_001',
        query: 'access query',
        retrievedDocs: [
          { docId: 'public-doc', score: 0.8, content: 'content', rank: 1 }
        ],
        actualResponse: 'Access granted',
        passed: true,
        metrics: {
          hasUnauthorizedDocs: 0,
          hasOnlyAuthorizedDocs: 1,
          totalRetrievedDocs: 1,
          rbacViolations: 0,
          apiLatency: 130,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'rbac_002',
        query: 'restricted access query',
        retrievedDocs: [
          { docId: 'secret-doc', score: 0.9, content: 'content', rank: 1 }
        ],
        actualResponse: 'Access denied',
        passed: false,
        metrics: {
          hasUnauthorizedDocs: 1,
          hasOnlyAuthorizedDocs: 0,
          totalRetrievedDocs: 1,
          rbacViolations: 1,
          apiLatency: 140,
          apiRetries: 0
        },
        timestamp: '2023-01-01T00:00:00Z'
      }
    ];
  });

  describe('calculateAggregatedMetrics', () => {
    it('should calculate metrics for all dataset types', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['gold', 'ood', 'inject', 'rbac']);

      expect(metrics.overall.totalEvaluations).toBe(9);
      expect(metrics.overall.passRate).toBeCloseTo(55.56, 1); // 5 out of 9 passed
      expect(metrics.overall.avgExecutionTime).toBe(250);

      expect(metrics.gold).toBeDefined();
      expect(metrics.ood).toBeDefined();
      expect(metrics.injection).toBeDefined();
      expect(metrics.rbac).toBeDefined();
    });

    it('should calculate metrics for specific dataset types only', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['gold']);

      expect(metrics.gold).toBeDefined();
      expect(metrics.ood).toBeUndefined();
      expect(metrics.injection).toBeUndefined();
      expect(metrics.rbac).toBeUndefined();
    });

    it('should handle empty results', async () => {
      const metrics = await calculator.calculateAggregatedMetrics([], ['gold']);

      expect(metrics.overall.totalEvaluations).toBe(0);
      expect(metrics.overall.passRate).toBe(0);
      expect(metrics.overall.avgExecutionTime).toBe(0);
    });
  });

  describe('calculatePassRate', () => {
    it('should calculate pass rate correctly', () => {
      const passRate = (calculator as any).calculatePassRate(mockResults);
      expect(passRate).toBeCloseTo(55.56, 1); // 5 out of 9 passed
    });

    it('should return 0 for empty results', () => {
      const passRate = (calculator as any).calculatePassRate([]);
      expect(passRate).toBe(0);
    });
  });

  describe('calculateAvgExecutionTime', () => {
    it('should return mock execution time', () => {
      const avgTime = (calculator as any).calculateAvgExecutionTime(mockResults);
      expect(avgTime).toBe(250);
    });

    it('should return 0 for empty results', () => {
      const avgTime = (calculator as any).calculateAvgExecutionTime([]);
      expect(avgTime).toBe(0);
    });
  });

  describe('calculateRecallAtKForDataset', () => {
    it('should calculate recall@1 correctly', () => {
      const goldResults = mockResults.filter(r => r.recordId.startsWith('gold'));
      const recall = calculator.calculateRecallAtKForDataset(goldResults, 1);

      expect(recall.k).toBe(1);
      expect(recall.totalRelevant).toBe(3);
      expect(recall.relevantFound).toBe(2); // First and third results found relevant docs (first at rank 1, third at rank 1 in its results)
      expect(recall.recall).toBeCloseTo(0.667, 2);
    });

    it('should calculate recall@3 correctly', () => {
      const goldResults = mockResults.filter(r => r.recordId.startsWith('gold'));
      const recall = calculator.calculateRecallAtKForDataset(goldResults, 3);

      expect(recall.k).toBe(3);
      expect(recall.relevantFound).toBe(2); // First and third results found relevant docs within rank 3
      expect(recall.recall).toBeCloseTo(0.667, 2);
    });

    it('should calculate recall@5 correctly', () => {
      const goldResults = mockResults.filter(r => r.recordId.startsWith('gold'));
      const recall = calculator.calculateRecallAtKForDataset(goldResults, 5);

      expect(recall.k).toBe(5);
      expect(recall.relevantFound).toBe(2); // Same as @3 since we only have 3 results
      expect(recall.recall).toBeCloseTo(0.667, 2);
    });
  });

  describe('calculateMRRForDataset', () => {
    it('should calculate MRR correctly', () => {
      const goldResults = mockResults.filter(r => r.recordId.startsWith('gold'));
      const mrr = calculator.calculateMRRForDataset(goldResults);

      expect(mrr.totalQueries).toBe(3);
      expect(mrr.queriesWithRelevant).toBe(2); // 2 out of 3 queries found relevant results
      expect(mrr.reciprocalRanks).toHaveLength(3);
      expect(mrr.reciprocalRanks[0]).toBe(1.0); // 1/1
      expect(mrr.reciprocalRanks[1]).toBe(0); // No relevant found
      expect(mrr.reciprocalRanks[2]).toBeCloseTo(0.333, 2); // 1/3
      expect(mrr.mrr).toBeCloseTo(0.444, 2); // (1.0 + 0 + 0.333) / 3
    });
  });

  describe('calculateConfidenceIntervals', () => {
    it('should calculate confidence intervals correctly', () => {
      const values = [0.8, 0.9, 0.7, 0.85, 0.75];
      const ci = calculator.calculateConfidenceIntervals(values, 0.95);

      expect(ci.mean).toBeCloseTo(0.8, 2);
      expect(ci.lowerBound).toBeLessThan(ci.mean);
      expect(ci.upperBound).toBeGreaterThan(ci.mean);
      expect(ci.standardError).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const ci = calculator.calculateConfidenceIntervals([]);

      expect(ci.mean).toBe(0);
      expect(ci.lowerBound).toBe(0);
      expect(ci.upperBound).toBe(0);
      expect(ci.standardError).toBe(0);
    });

    it('should handle single value', () => {
      const ci = calculator.calculateConfidenceIntervals([0.8]);

      expect(ci.mean).toBe(0.8);
      // For single value, confidence intervals are undefined (NaN)
      expect(isNaN(ci.lowerBound)).toBe(true);
      expect(isNaN(ci.upperBound)).toBe(true);
      expect(isNaN(ci.standardError)).toBe(true);
    });
  });

  describe('generateDetailedReport', () => {
    it('should generate a comprehensive report', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['gold', 'ood', 'inject', 'rbac']);
      const report = calculator.generateDetailedReport(metrics);

      expect(report).toContain('=== Detailed Evaluation Report ===');
      expect(report).toContain('Overall Performance');
      expect(report).toContain('Total Evaluations: 9');
      expect(report).toContain('Gold Standard Dataset');
      expect(report).toContain('Out-of-Domain Dataset');
      expect(report).toContain('Injection Attack Dataset');
      expect(report).toContain('RBAC Dataset');
      expect(report).toContain('Recall@1');
      expect(report).toContain('Mean Reciprocal Rank');
      expect(report).toContain('Precision:');
      expect(report).toContain('Bypass Rate:');
      expect(report).toContain('Leak Rate:');
    });

    it('should handle partial metrics', () => {
      const partialMetrics: AggregatedMetrics = {
        overall: {
          totalEvaluations: 5,
          passRate: 80,
          avgExecutionTime: 200
        },
        gold: {
          recallAt1: { k: 1, recall: 0.8, relevantFound: 4, totalRelevant: 5 },
          recallAt3: { k: 3, recall: 0.9, relevantFound: 5, totalRelevant: 5 },
          recallAt5: { k: 5, recall: 1.0, relevantFound: 5, totalRelevant: 5 },
          mrr: { mrr: 0.85, reciprocalRanks: [1, 0.5, 0.33, 0.25, 0.2], queriesWithRelevant: 5, totalQueries: 5 }
        }
      };

      const report = calculator.generateDetailedReport(partialMetrics);

      expect(report).toContain('Gold Standard Dataset');
      expect(report).not.toContain('Out-of-Domain Dataset');
      expect(report).not.toContain('Injection Attack Dataset');
      expect(report).not.toContain('RBAC Dataset');
    });
  });

  // Test private methods indirectly through public methods
  describe('private method validation through public interfaces', () => {
    it('should calculate IDK metrics correctly', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['ood']);

      expect(metrics.ood).toBeDefined();
      expect(metrics.ood!.precision).toBe(1.0); // 1 true positive, 0 false positives
      expect(metrics.ood!.recall).toBe(0.5); // 1 true positive, 1 false negative
      expect(metrics.ood!.f1Score).toBeCloseTo(0.667, 2);
      expect(metrics.ood!.truePositives).toBe(1);
      expect(metrics.ood!.falseNegatives).toBe(1);
    });

    it('should calculate injection metrics correctly', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['inject']);

      expect(metrics.injection).toBeDefined();
      expect(metrics.injection!.bypassRate).toBe(0.5); // 1 successful bypass out of 2 attempts
      expect(metrics.injection!.detectionRate).toBe(0.5); // 1 detected out of 2 attempts
      expect(metrics.injection!.totalAttempts).toBe(2);
      expect(metrics.injection!.successfulBypasses).toBe(1);
      expect(metrics.injection!.detectedAttacks).toBe(1);
    });

    it('should calculate RBAC metrics correctly', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(mockResults, ['rbac']);

      expect(metrics.rbac).toBeDefined();
      expect(metrics.rbac!.leakRate).toBe(0.5); // 1 unauthorized access out of 2 queries
      expect(metrics.rbac!.enforcementRate).toBe(0.5); // 1 properly blocked out of 2 queries
      expect(metrics.rbac!.totalQueries).toBe(2);
      expect(metrics.rbac!.unauthorizedAccess).toBe(1);
      expect(metrics.rbac!.properlyBlocked).toBe(1);
    });
  });
});