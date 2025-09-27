import { ReportGenerator, MetricThreshold } from '../reporting.js';
import { AggregatedMetrics, EvaluationReport } from '../types.js';

// Mock fs
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    mkdir: jest.fn()
  }
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let mockMetrics: AggregatedMetrics;
  let mockReport: EvaluationReport;
  let mockPerformanceStats: any;

  beforeEach(() => {
    jest.clearAllMocks();

    generator = new ReportGenerator();

    mockMetrics = {
      gold: {
        recallAt1: { k: 1, recall: 0.6, relevantFound: 3, totalRelevant: 5 },
        recallAt3: { k: 3, recall: 0.8, relevantFound: 4, totalRelevant: 5 },
        recallAt5: { k: 5, recall: 0.9, relevantFound: 5, totalRelevant: 5 },
        mrr: { mrr: 0.7, reciprocalRanks: [1.0, 0.5, 0.33, 0.25, 0.2], queriesWithRelevant: 4, totalQueries: 5 }
      },
      ood: {
        precision: 1.0,
        recall: 0.9,
        f1Score: 0.95,
        truePositives: 9,
        falsePositives: 0,
        falseNegatives: 1,
        trueNegatives: 10
      },
      injection: {
        bypassRate: 0.0,
        detectionRate: 1.0,
        totalAttempts: 10,
        successfulBypasses: 0,
        detectedAttacks: 10
      },
      rbac: {
        leakRate: 0.0,
        enforcementRate: 1.0,
        totalQueries: 10,
        unauthorizedAccess: 0,
        properlyBlocked: 10
      },
      overall: {
        totalEvaluations: 30,
        passRate: 90,
        avgExecutionTime: 150
      }
    };

    mockReport = {
      config: {
        datasets: ['gold', 'ood', 'inject', 'rbac'],
        retrievalConfig: {
          topK: 5,
          rerankerEnabled: true
        },
        guardrailsConfig: {
          injectionDetectionEnabled: true,
          rbacEnforcementEnabled: true,
          idkThreshold: 0.8
        },
        outputConfig: {
          saveResults: true,
          outputDir: './output',
          includeDetails: true
        }
      },
      results: [
        {
          recordId: 'gold_001',
          query: 'test query',
          retrievedDocs: [],
          actualResponse: 'response',
          passed: true,
          metrics: { expectedDocFound: 1 },
          timestamp: '2023-01-01T00:00:00Z'
        }
      ],
      metrics: mockMetrics,
      summary: {
        startTime: '2023-01-01T00:00:00Z',
        endTime: '2023-01-01T00:01:00Z',
        duration: 60000,
        totalQueries: 8,
        successfulQueries: 6,
        failedQueries: 2
      }
    };

    mockPerformanceStats = {
      totalCalls: 8,
      averageDuration: 500,
      successRate: 0.99,
      retryRate: 0.1,
      p95Duration: 800,
      p99Duration: 1000
    };
  });

  describe('constructor', () => {
    it('should initialize with default thresholds', () => {
      const gen = new ReportGenerator();
      const thresholds = gen.getThresholds();

      expect(thresholds.length).toBeGreaterThan(0);
      expect(thresholds[0]).toHaveProperty('metric');
      expect(thresholds[0]).toHaveProperty('operator');
      expect(thresholds[0]).toHaveProperty('value');
    });

    it('should accept custom thresholds', () => {
      const customThresholds: MetricThreshold[] = [
        {
          metric: 'custom.metric',
          operator: '>',
          value: 0.9,
          critical: false,
          description: 'Custom threshold'
        }
      ];

      const gen = new ReportGenerator(customThresholds);
      const thresholds = gen.getThresholds();

      expect(thresholds).toContain(customThresholds[0]);
    });
  });

  describe('getThresholds', () => {
    it('should return all thresholds', () => {
      const thresholds = generator.getThresholds();

      expect(Array.isArray(thresholds)).toBe(true);
      expect(thresholds.length).toBeGreaterThan(10);
    });
  });

  describe('validateThresholds', () => {
    it('should validate all thresholds correctly', () => {
      const results = generator.validateThresholds(mockMetrics, mockPerformanceStats);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('metric');
      expect(results[0]).toHaveProperty('actual');
      expect(results[0]).toHaveProperty('passed');
      expect(results[0]).toHaveProperty('severity');
      expect(results[0]).toHaveProperty('message');
    });

    it('should handle missing metrics', () => {
      const incompleteMetrics = { overall: mockMetrics.overall };
      const results = generator.validateThresholds(incompleteMetrics);

      const missingResults = results.filter(r => isNaN(r.actual));
      expect(missingResults.length).toBeGreaterThan(0);
      expect(missingResults[0].severity).toBe('warning');
    });
  });

  describe('extractMetricValue', () => {
    it('should extract nested metric values', () => {
      const value = (generator as any).extractMetricValue(mockMetrics, mockPerformanceStats, 'gold.recallAt1.recall');
      expect(value).toBe(0.6);
    });

    it('should extract performance stats', () => {
      const value = (generator as any).extractMetricValue(mockMetrics, mockPerformanceStats, 'performance.averageDuration');
      expect(value).toBe(500);
    });

    it('should return null for non-existent paths', () => {
      const value = (generator as any).extractMetricValue(mockMetrics, mockPerformanceStats, 'nonexistent.path');
      expect(value).toBeNull();
    });
  });

  describe('evaluateThreshold', () => {
    it('should evaluate greater than operator', () => {
      const threshold: MetricThreshold = {
        metric: 'test',
        operator: '>',
        value: 0.5,
        critical: false,
        description: 'test'
      };

      expect((generator as any).evaluateThreshold(0.6, threshold)).toBe(true);
      expect((generator as any).evaluateThreshold(0.4, threshold)).toBe(false);
    });

    it('should evaluate less than operator', () => {
      const threshold: MetricThreshold = {
        metric: 'test',
        operator: '<',
        value: 0.5,
        critical: false,
        description: 'test'
      };

      expect((generator as any).evaluateThreshold(0.4, threshold)).toBe(true);
      expect((generator as any).evaluateThreshold(0.6, threshold)).toBe(false);
    });

    it('should evaluate equals operator', () => {
      const threshold: MetricThreshold = {
        metric: 'test',
        operator: '==',
        value: 0.5,
        critical: false,
        description: 'test'
      };

      expect((generator as any).evaluateThreshold(0.5, threshold)).toBe(true);
      expect((generator as any).evaluateThreshold(0.6, threshold)).toBe(false);
    });

    it('should evaluate not equals operator', () => {
      const threshold: MetricThreshold = {
        metric: 'test',
        operator: '!=',
        value: 0.5,
        critical: false,
        description: 'test'
      };

      expect((generator as any).evaluateThreshold(0.6, threshold)).toBe(true);
      expect((generator as any).evaluateThreshold(0.5, threshold)).toBe(false);
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate markdown report', async () => {
      const report = await generator.generateMarkdownReport(mockReport, mockPerformanceStats);

      expect(typeof report).toBe('string');
      expect(report).toContain('# Evaluation Report');
      expect(report).toContain('⚠️ Status: PASSED WITH WARNINGS');
      expect(report).toContain('## Gold Dataset');
      expect(report).toContain('## Performance Metrics');
    });

    it('should generate report with failures', async () => {
      // Create metrics that will fail thresholds
      const failingMetrics = {
        ...mockMetrics,
        gold: {
          ...mockMetrics.gold!,
          recallAt5: { k: 5, recall: 0.5, relevantFound: 1, totalRelevant: 2 }
        },
        injection: {
          ...mockMetrics.injection!,
          bypassRate: 0.05 // Above threshold
        }
      };

      const failingReport = { ...mockReport, metrics: failingMetrics };
      const report = await generator.generateMarkdownReport(failingReport);

      expect(report).toContain('❌ Status: FAILED');
      expect(report).toContain('Critical Failures');
    });

    it('should write to file when outputPath provided', async () => {
      const { promises } = require('fs');
      const outputPath = '/tmp/report.md';

      await generator.generateMarkdownReport(mockReport, mockPerformanceStats, outputPath);

      expect(promises.writeFile).toHaveBeenCalledWith(outputPath, expect.any(String), 'utf8');
    });
  });

  describe('generateJSONReport', () => {
    it('should generate JSON report', async () => {
      const report = await generator.generateJSONReport(mockReport, mockPerformanceStats);

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('thresholdValidation');
    });

    it('should write to file when outputPath provided', async () => {
      const { promises } = require('fs');
      const outputPath = '/tmp/report.json';

      await generator.generateJSONReport(mockReport, mockPerformanceStats, outputPath);

      expect(promises.writeFile).toHaveBeenCalledWith(outputPath, expect.any(String), 'utf8');
    });
  });

  describe('generateHTMLDashboard', () => {
    it('should generate HTML dashboard', async () => {
      const html = await generator.generateHTMLDashboard(mockReport, mockPerformanceStats);

      expect(typeof html).toBe('string');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Evaluation Dashboard');
      expect(html).toContain('Status: PASSED WITH WARNINGS');
    });

    it('should include performance metrics when provided', async () => {
      const html = await generator.generateHTMLDashboard(mockReport, mockPerformanceStats);

      expect(html).toContain('⚡ Performance');
      expect(html).toContain('API Success Rate');
    });

    it('should write to file when outputPath provided', async () => {
      const { promises } = require('fs');
      const outputPath = '/tmp/dashboard.html';

      await generator.generateHTMLDashboard(mockReport, mockPerformanceStats, outputPath);

      expect(promises.writeFile).toHaveBeenCalledWith(outputPath, expect.any(String), 'utf8');
    });
  });

  describe('getOverallStatus', () => {
    it('should return PASSED when no failures', () => {
      const validationResults = [
        { passed: true, severity: 'info' as const },
        { passed: true, severity: 'info' as const }
      ];

      const status = (generator as any).getOverallStatus(validationResults);
      expect(status).toBe('PASSED');
    });

    it('should return WARNING when only warnings', () => {
      const validationResults = [
        { passed: true, severity: 'info' as const },
        { passed: false, severity: 'warning' as const }
      ];

      const status = (generator as any).getOverallStatus(validationResults);
      expect(status).toBe('WARNING');
    });

    it('should return FAILED when critical failures exist', () => {
      const validationResults = [
        { passed: false, severity: 'critical' as const },
        { passed: true, severity: 'info' as const }
      ];

      const status = (generator as any).getOverallStatus(validationResults);
      expect(status).toBe('FAILED');
    });
  });

  describe('generateAllReports', () => {
    it('should generate all report formats', async () => {
      const { promises } = require('fs');
      const outputDir = '/tmp/reports';

      await generator.generateAllReports(mockReport, mockPerformanceStats, outputDir);

      expect(promises.mkdir).toHaveBeenCalledWith(outputDir, { recursive: true });
      expect(promises.writeFile).toHaveBeenCalledTimes(4); // 3 reports + 1 summary
      expect(promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ci-summary.json'),
        expect.any(String),
        'utf8'
      );
    });
  });
});