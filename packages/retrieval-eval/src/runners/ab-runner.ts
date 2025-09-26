#!/usr/bin/env node

/**
 * A/B testing runner for retrieval evaluation
 */

import { ABTestConfig, EvaluationReport, RetrievalConfig, GoldenTestCase } from '../types/eval.js';
import { GOLDEN_TEST_SET } from '../test-data/golden-set.js';
import { ContextualJudger } from '../judgers/retrieval-judger.js';

export class ABTestRunner {
  private judger: ContextualJudger;

  constructor(
    private baselineService: any,
    private candidateService: any
  ) {
    this.judger = new ContextualJudger();
  }

  /**
   * Run A/B test with given configuration
   */
  async runTest(config: ABTestConfig): Promise<EvaluationReport> {
    const testRunId = `ab-test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();

    console.log(`🚀 Starting A/B test: ${config.name}`);
    console.log(`📊 Test ID: ${testRunId}`);
    console.log(`📋 Test cases: ${config.testCases.length}`);

    // Run baseline evaluation
    console.log('🏁 Running baseline evaluation...');
    const baselineResults = await this.evaluateConfig(config.baseline, config.testCases);

    // Run candidate evaluation
    console.log('🏁 Running candidate evaluation...');
    const candidateResults = await this.evaluateConfig(config.candidate, config.testCases);

    // Generate comparison report
    const report = this.generateReport(testRunId, timestamp, config, baselineResults, candidateResults, config.testCases);

    console.log('✅ A/B test completed');
    console.log(`📈 Baseline avg F1: ${(report.summary.avgF1 * 100).toFixed(1)}%`);
    console.log(`📈 Candidate avg F1: ${(this.calculateAverageF1(candidateResults) * 100).toFixed(1)}%`);

    return report;
  }

  /**
   * Evaluate a single configuration
   */
  private async evaluateConfig(config: RetrievalConfig, testCases: GoldenTestCase[]) {
    const results = [];

    for (const testCase of testCases) {
      try {
        // Create search request with config
        const searchRequest = {
          query: testCase.query,
          limit: config.retrievalK,
          vectorWeight: config.vectorWeight,
          keywordWeight: config.keywordWeight,
          rrfK: config.rrfK,
          enableKeywordSearch: config.enableKeywordSearch,
          tenantId: 'test-tenant'
        };

        // Mock user context
        const userContext = {
          id: 'test-user',
          groupIds: ['test-group'],
          tenantId: 'test-tenant'
        };

        // Run search (this would need to be implemented with actual service)
        const searchResult = await this.runSearchWithConfig(config, searchRequest, userContext);

        // Judge result
        const evaluation = this.judger.judge(testCase, searchResult);
        results.push(evaluation);

      } catch (error) {
        console.error(`❌ Failed to evaluate test case ${testCase.id}:`, error);
        // Add failed result
        results.push({
          testCase,
          result: null,
          scores: { precision: 0, recall: 0, f1: 0, ndcg: 0, mrr: 0 },
          judgments: { relevantChunksFound: 0, totalRelevantChunks: testCase.expectedChunks.length, answerable: false, confidence: 0 }
        });
      }
    }

    return results;
  }

  /**
   * Run search with specific configuration (mock implementation)
   */
  private async runSearchWithConfig(config: RetrievalConfig, request: any, userContext: any) {
    // This is a placeholder - in real implementation, this would call the actual search service
    // For now, return mock results based on configuration

    const mockRetrievedChunks = [
      {
        id: 'mock-chunk-1',
        score: 0.8,
        content: 'Mock content for testing',
        docId: 'mock-doc-1',
        rank: 1
      }
    ];

    return {
      queryId: `query-${Date.now()}`,
      retrievedChunks: mockRetrievedChunks,
      metrics: {
        totalTime: 100 + Math.random() * 200,
        vectorSearchTime: 50 + Math.random() * 50,
        keywordSearchTime: 30 + Math.random() * 30,
        fusionTime: 10 + Math.random() * 20,
        rerankerTime: config.rerankerEnabled ? 20 + Math.random() * 30 : 0
      }
    };
  }

  /**
   * Generate comprehensive evaluation report
   */
  private generateReport(
    testRunId: string,
    timestamp: string,
    config: ABTestConfig,
    baselineResults: any[],
    candidateResults: any[],
    testCases: GoldenTestCase[]
  ): EvaluationReport {
    const baselineF1 = this.calculateAverageF1(baselineResults);
    const candidateF1 = this.calculateAverageF1(candidateResults);

    // Count wins/ties
    let baselineWins = 0;
    let candidateWins = 0;
    let ties = 0;
    const significantImprovements: string[] = [];

    for (let i = 0; i < baselineResults.length; i++) {
      const baselineF1Score = baselineResults[i].scores.f1;
      const candidateF1Score = candidateResults[i].scores.f1;
      const diff = candidateF1Score - baselineF1Score;

      if (Math.abs(diff) < 0.05) { // 5% threshold for tie
        ties++;
      } else if (diff > 0) {
        candidateWins++;
        if (diff > 0.1) { // 10% improvement is significant
          significantImprovements.push(testCases[i].id);
        }
      } else {
        baselineWins++;
      }
    }

    return {
      testRunId,
      timestamp,
      config,
      results: candidateResults, // Return candidate results as primary
      summary: {
        avgPrecision: this.calculateAverage(candidateResults, 'precision'),
        avgRecall: this.calculateAverage(candidateResults, 'recall'),
        avgF1: candidateF1,
        avgNDCG: this.calculateAverage(candidateResults, 'ndcg'),
        avgMRR: this.calculateAverage(candidateResults, 'mrr'),
        totalQueries: candidateResults.length,
        answerableQueries: candidateResults.filter(r => r.judgments.answerable).length
      },
      comparisons: {
        baselineWins,
        candidateWins,
        ties,
        significantImprovements
      }
    };
  }

  private calculateAverageF1(results: any[]): number {
    return this.calculateAverage(results, 'f1');
  }

  private calculateAverage(results: any[], metric: string): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, r) => acc + r.scores[metric], 0);
    return sum / results.length;
  }
}

/**
 * CLI runner
 */
export async function runABTest(testName: string, baselineConfig: RetrievalConfig, candidateConfig: RetrievalConfig) {
  const testConfig: ABTestConfig = {
    name: testName,
    description: `A/B test comparing ${baselineConfig.name} vs ${candidateConfig.name}`,
    baseline: baselineConfig,
    candidate: candidateConfig,
    testCases: GOLDEN_TEST_SET,
    metrics: ['precision', 'recall', 'f1', 'ndcg', 'mrr']
  };

  // Mock services - in real implementation, these would be actual service instances
  const mockBaselineService = {} as any;
  const mockCandidateService = {} as any;

  const runner = new ABTestRunner(mockBaselineService, mockCandidateService);
  const report = await runner.runTest(testConfig);

  console.log(JSON.stringify(report, null, 2));
  return report;
}