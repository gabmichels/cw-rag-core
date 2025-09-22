// Export all types
export * from './types.js';

// Export core classes
export { EvaluationRunner } from './runner.js';
export { MetricsCalculator } from './metrics.js';

// Export CLI program
export { program } from './cli.js';

// Import for internal use
import { EvaluationRunner } from './runner.js';
import { MetricsCalculator } from './metrics.js';
import type { EvaluationConfig, Dataset } from './types.js';

// Main evaluation harness API
export class EvaluationHarness {
  private runner: EvaluationRunner;
  private calculator: MetricsCalculator;

  constructor(config: EvaluationConfig) {
    this.runner = new EvaluationRunner(config);
    this.calculator = new MetricsCalculator();
  }

  async runEvaluation(
    datasets: Dataset[],
    options: { verbose?: boolean; parallel?: boolean; maxConcurrency?: number } = {}
  ) {
    const results = [];

    for (const dataset of datasets) {
      const datasetResults = await this.runner.runDataset(dataset, {
        verbose: options.verbose || false,
        parallel: options.parallel || false,
        maxConcurrency: options.maxConcurrency || 5
      });
      results.push(...datasetResults);
    }

    const metrics = await this.calculator.calculateAggregatedMetrics(
      results,
      datasets.map(d => d.type)
    );

    return {
      results,
      metrics,
      summary: {
        totalQueries: results.length,
        successfulQueries: results.filter(r => r.passed).length,
        failedQueries: results.filter(r => !r.passed).length,
        passRate: results.length > 0 ? (results.filter(r => r.passed).length / results.length) * 100 : 0
      }
    };
  }

  getMetricsCalculator() {
    return this.calculator;
  }

  getRunner() {
    return this.runner;
  }
}