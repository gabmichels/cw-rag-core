// Jest globals are automatically available in test environment
import { MetricsCalculator } from '../metrics.js';
import { EvaluationResult } from '../types.js';

describe('MetricsCalculator', () => {
  let calculator: MetricsCalculator;
  let goldResults: EvaluationResult[];
  let oodResults: EvaluationResult[];

  beforeEach(() => {
    calculator = new MetricsCalculator();

    // Mock gold standard results
    goldResults = [
      {
        recordId: 'gold_001',
        query: 'test query 1',
        retrievedDocs: [
          { docId: 'doc1', score: 0.9, content: 'content', rank: 1 },
          { docId: 'doc2', score: 0.8, content: 'content', rank: 2 }
        ],
        actualResponse: 'response',
        passed: true,
        metrics: { expectedDocFound: 1, relevantDocRank: 1 },
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
        metrics: { expectedDocFound: 0, relevantDocRank: -1 },
        timestamp: '2023-01-01T00:00:00Z'
      }
    ];

    // Mock OOD results
    oodResults = [
      {
        recordId: 'ood_001',
        query: 'weather query',
        retrievedDocs: [],
        actualResponse: "I don't know",
        passed: true,
        metrics: { isIDKResponse: 1, shouldBeIDK: 1 },
        timestamp: '2023-01-01T00:00:00Z'
      },
      {
        recordId: 'ood_002',
        query: 'cooking query',
        retrievedDocs: [],
        actualResponse: "Here's how to cook",
        passed: false,
        metrics: { isIDKResponse: 0, shouldBeIDK: 1 },
        timestamp: '2023-01-01T00:00:00Z'
      }
    ];
  });

  describe('calculateAggregatedMetrics', () => {
    it('should calculate metrics for gold dataset', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(goldResults, ['gold']);

      expect(metrics.overall.totalEvaluations).toBe(2);
      expect(metrics.overall.passRate).toBe(50); // 1 out of 2 passed
      expect(metrics.gold).toBeDefined();
      expect(metrics.gold?.recallAt1.recall).toBe(0.5); // 1 out of 2 found at rank 1
    });

    it('should calculate metrics for OOD dataset', async () => {
      const metrics = await calculator.calculateAggregatedMetrics(oodResults, ['ood']);

      expect(metrics.overall.totalEvaluations).toBe(2);
      expect(metrics.overall.passRate).toBe(50);
      expect(metrics.ood).toBeDefined();
      expect(metrics.ood?.precision).toBe(1.0); // 1 true positive, 0 false positives
      expect(metrics.ood?.recall).toBe(0.5); // 1 true positive, 1 false negative
    });

    it('should calculate overall metrics for mixed datasets', async () => {
      const allResults = [...goldResults, ...oodResults];
      const metrics = await calculator.calculateAggregatedMetrics(allResults, ['gold', 'ood']);

      expect(metrics.overall.totalEvaluations).toBe(4);
      expect(metrics.overall.passRate).toBe(50); // 2 out of 4 passed
      expect(metrics.gold).toBeDefined();
      expect(metrics.ood).toBeDefined();
    });
  });

  describe('calculateRecallAtKForDataset', () => {
    it('should calculate recall@1 correctly', () => {
      const recall = calculator.calculateRecallAtKForDataset(goldResults, 1);

      expect(recall.k).toBe(1);
      expect(recall.totalRelevant).toBe(2);
      expect(recall.relevantFound).toBe(1);
      expect(recall.recall).toBe(0.5);
    });

    it('should calculate recall@3 correctly', () => {
      const recall = calculator.calculateRecallAtKForDataset(goldResults, 3);

      expect(recall.k).toBe(3);
      expect(recall.recall).toBe(0.5); // Still only 1 relevant found
    });
  });

  describe('calculateMRRForDataset', () => {
    it('should calculate MRR correctly', () => {
      const mrr = calculator.calculateMRRForDataset(goldResults);

      expect(mrr.totalQueries).toBe(2);
      expect(mrr.queriesWithRelevant).toBe(1);
      expect(mrr.reciprocalRanks).toHaveLength(2);
      expect(mrr.reciprocalRanks[0]).toBe(1.0); // 1/1 for first query
      expect(mrr.reciprocalRanks[1]).toBe(0); // 0 for second query (no relevant found)
      expect(mrr.mrr).toBe(0.5); // (1.0 + 0) / 2
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
  });

  describe('generateDetailedReport', () => {
    it('should generate a comprehensive report', async () => {
      const allResults = [...goldResults, ...oodResults];
      const metrics = await calculator.calculateAggregatedMetrics(allResults, ['gold', 'ood']);
      const report = calculator.generateDetailedReport(metrics);

      expect(report).toContain('Detailed Evaluation Report');
      expect(report).toContain('Overall Performance');
      expect(report).toContain('Gold Standard Dataset');
      expect(report).toContain('Out-of-Domain Dataset');
      expect(report).toContain('Total Evaluations: 4');
      expect(report).toContain('Pass Rate: 50.00%');
    });
  });
});