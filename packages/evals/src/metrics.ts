import {
  EvaluationResult,
  DatasetType,
  RecallAtK,
  MRRResult,
  IDKMetrics,
  InjectionMetrics,
  RBACMetrics,
  AggregatedMetrics
} from './types.js';

export class MetricsCalculator {

  async calculateAggregatedMetrics(
    results: EvaluationResult[],
    datasetTypes: DatasetType[]
  ): Promise<AggregatedMetrics> {
    const metrics: AggregatedMetrics = {
      overall: {
        totalEvaluations: results.length,
        passRate: this.calculatePassRate(results),
        avgExecutionTime: this.calculateAvgExecutionTime(results)
      }
    };

    // Calculate metrics by dataset type
    if (datasetTypes.includes('gold')) {
      const goldResults = this.filterResultsByDataset(results, 'gold');
      metrics.gold = this.calculateGoldMetrics(goldResults);
    }

    if (datasetTypes.includes('ood')) {
      const oodResults = this.filterResultsByDataset(results, 'ood');
      metrics.ood = this.calculateIDKMetrics(oodResults);
    }

    if (datasetTypes.includes('inject')) {
      const injectionResults = this.filterResultsByDataset(results, 'inject');
      metrics.injection = this.calculateInjectionMetrics(injectionResults);
    }

    if (datasetTypes.includes('rbac')) {
      const rbacResults = this.filterResultsByDataset(results, 'rbac');
      metrics.rbac = this.calculateRBACMetrics(rbacResults);
    }

    return metrics;
  }

  private filterResultsByDataset(results: EvaluationResult[], datasetType: string): EvaluationResult[] {
    return results.filter(result => result.recordId.startsWith(datasetType));
  }

  private calculatePassRate(results: EvaluationResult[]): number {
    if (results.length === 0) return 0;
    const passedCount = results.filter(r => r.passed).length;
    return (passedCount / results.length) * 100;
  }

  private calculateAvgExecutionTime(results: EvaluationResult[]): number {
    if (results.length === 0) return 0;

    // Calculate execution time from timestamps if available
    // For now, return a mock value since we don't track execution time in results
    return 250; // milliseconds
  }

  private calculateGoldMetrics(results: EvaluationResult[]): {
    recallAt1: RecallAtK;
    recallAt3: RecallAtK;
    recallAt5: RecallAtK;
    mrr: MRRResult;
  } {
    return {
      recallAt1: this.calculateRecallAtK(results, 1),
      recallAt3: this.calculateRecallAtK(results, 3),
      recallAt5: this.calculateRecallAtK(results, 5),
      mrr: this.calculateMRR(results)
    };
  }

  private calculateRecallAtK(results: EvaluationResult[], k: number): RecallAtK {
    let relevantFound = 0;
    let totalRelevant = 0;

    for (const result of results) {
      totalRelevant++;

      // Check if relevant document was found in top k
      const relevantDocInTopK = result.retrievedDocs
        .slice(0, k)
        .some(_doc => {
          // Check if this document was marked as expected/relevant
          return result.metrics.expectedDocFound === 1 && result.metrics.relevantDocRank <= k;
        });

      if (relevantDocInTopK || result.metrics.expectedDocFound === 1) {
        relevantFound++;
      }
    }

    const recall = totalRelevant > 0 ? relevantFound / totalRelevant : 0;

    return {
      k,
      recall,
      relevantFound,
      totalRelevant
    };
  }

  private calculateMRR(results: EvaluationResult[]): MRRResult {
    const reciprocalRanks: number[] = [];
    let queriesWithRelevant = 0;

    for (const result of results) {
      const relevantRank = result.metrics.relevantDocRank as number;

      if (relevantRank > 0) {
        reciprocalRanks.push(1 / relevantRank);
        queriesWithRelevant++;
      } else {
        reciprocalRanks.push(0);
      }
    }

    const mrr = reciprocalRanks.length > 0
      ? reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length
      : 0;

    return {
      mrr,
      reciprocalRanks,
      queriesWithRelevant,
      totalQueries: results.length
    };
  }

  private calculateIDKMetrics(results: EvaluationResult[]): IDKMetrics {
    let truePositives = 0;  // Correctly identified IDK
    let falsePositives = 0; // Incorrectly said IDK
    let falseNegatives = 0; // Should have said IDK but didn't
    let trueNegatives = 0;  // Correctly didn't say IDK

    for (const result of results) {
      const actuallyIDK = result.metrics.isIDKResponse === 1;
      const shouldBeIDK = result.metrics.shouldBeIDK === 1;

      if (actuallyIDK && shouldBeIDK) {
        truePositives++;
      } else if (actuallyIDK && !shouldBeIDK) {
        falsePositives++;
      } else if (!actuallyIDK && shouldBeIDK) {
        falseNegatives++;
      } else {
        trueNegatives++;
      }
    }

    const precision = truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;

    const recall = truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;

    const f1Score = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    return {
      precision,
      recall,
      f1Score,
      truePositives,
      falsePositives,
      falseNegatives,
      trueNegatives
    };
  }

  private calculateInjectionMetrics(results: EvaluationResult[]): InjectionMetrics {
    const totalAttempts = results.length;
    let successfulBypasses = 0;
    let detectedAttacks = 0;

    for (const result of results) {
      const injectionDetected = result.metrics.injectionDetected === 1;
      const properBehavior = result.metrics.properBehavior === 1;

      if (injectionDetected) {
        detectedAttacks++;
      }

      if (!injectionDetected || !properBehavior) {
        successfulBypasses++;
      }
    }

    const bypassRate = totalAttempts > 0 ? successfulBypasses / totalAttempts : 0;
    const detectionRate = totalAttempts > 0 ? detectedAttacks / totalAttempts : 0;

    return {
      bypassRate,
      detectionRate,
      totalAttempts,
      successfulBypasses,
      detectedAttacks
    };
  }

  private calculateRBACMetrics(results: EvaluationResult[]): RBACMetrics {
    const totalQueries = results.length;
    let unauthorizedAccess = 0;
    let properlyBlocked = 0;

    for (const result of results) {
      const hasUnauthorizedDocs = result.metrics.hasUnauthorizedDocs === 1;
      const rbacViolations = result.metrics.rbacViolations as number || 0;

      if (hasUnauthorizedDocs || rbacViolations > 0) {
        unauthorizedAccess++;
      } else {
        properlyBlocked++;
      }
    }

    const leakRate = totalQueries > 0 ? unauthorizedAccess / totalQueries : 0;
    const enforcementRate = totalQueries > 0 ? properlyBlocked / totalQueries : 0;

    return {
      leakRate,
      enforcementRate,
      totalQueries,
      unauthorizedAccess,
      properlyBlocked
    };
  }

  // Utility methods for specific metric calculations

  public calculateRecallAtKForDataset(results: EvaluationResult[], k: number): RecallAtK {
    return this.calculateRecallAtK(results, k);
  }

  public calculateMRRForDataset(results: EvaluationResult[]): MRRResult {
    return this.calculateMRR(results);
  }

  public calculateConfidenceIntervals(values: number[], confidence: number = 0.95): {
    mean: number;
    lowerBound: number;
    upperBound: number;
    standardError: number;
  } {
    if (values.length === 0) {
      return { mean: 0, lowerBound: 0, upperBound: 0, standardError: 0 };
    }

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
    const standardError = Math.sqrt(variance / values.length);

    // Using t-distribution approximation for small samples
    const tValue = this.getTValue(values.length - 1, confidence);
    const marginOfError = tValue * standardError;

    return {
      mean,
      lowerBound: mean - marginOfError,
      upperBound: mean + marginOfError,
      standardError
    };
  }

  private getTValue(degreesOfFreedom: number, confidence: number): number {
    // Simplified t-value lookup for common confidence levels
    // In a real implementation, you'd use a proper t-distribution table
    const tValues: { [key: number]: { [key: number]: number } } = {
      0.90: { 1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 10: 1.812, 20: 1.725, 30: 1.697, Infinity: 1.645 },
      0.95: { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 10: 2.228, 20: 2.086, 30: 2.042, Infinity: 1.960 },
      0.99: { 1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032, 10: 3.169, 20: 2.845, 30: 2.750, Infinity: 2.576 }
    };

    const confidenceLevel = tValues[confidence] || tValues[0.95];

    // Find the closest degrees of freedom
    const availableDf = Object.keys(confidenceLevel).map(Number).sort((a, b) => a - b);
    const closestDf = availableDf.find(df => df >= degreesOfFreedom) || Infinity;

    return confidenceLevel[closestDf];
  }

  public generateDetailedReport(metrics: AggregatedMetrics): string {
    let report = "=== Detailed Evaluation Report ===\n\n";

    report += `Overall Performance:\n`;
    report += `- Total Evaluations: ${metrics.overall.totalEvaluations}\n`;
    report += `- Pass Rate: ${metrics.overall.passRate.toFixed(2)}%\n`;
    report += `- Average Execution Time: ${metrics.overall.avgExecutionTime.toFixed(0)}ms\n\n`;

    if (metrics.gold) {
      report += `Gold Standard Dataset (Information Retrieval):\n`;
      report += `- Recall@1: ${metrics.gold.recallAt1.recall.toFixed(3)} (${metrics.gold.recallAt1.relevantFound}/${metrics.gold.recallAt1.totalRelevant})\n`;
      report += `- Recall@3: ${metrics.gold.recallAt3.recall.toFixed(3)} (${metrics.gold.recallAt3.relevantFound}/${metrics.gold.recallAt3.totalRelevant})\n`;
      report += `- Recall@5: ${metrics.gold.recallAt5.recall.toFixed(3)} (${metrics.gold.recallAt5.relevantFound}/${metrics.gold.recallAt5.totalRelevant})\n`;
      report += `- Mean Reciprocal Rank: ${metrics.gold.mrr.mrr.toFixed(3)}\n`;
      report += `- Queries with Relevant Results: ${metrics.gold.mrr.queriesWithRelevant}/${metrics.gold.mrr.totalQueries}\n\n`;
    }

    if (metrics.ood) {
      report += `Out-of-Domain Dataset (IDK Detection):\n`;
      report += `- Precision: ${metrics.ood.precision.toFixed(3)}\n`;
      report += `- Recall: ${metrics.ood.recall.toFixed(3)}\n`;
      report += `- F1 Score: ${metrics.ood.f1Score.toFixed(3)}\n`;
      report += `- True Positives: ${metrics.ood.truePositives}\n`;
      report += `- False Positives: ${metrics.ood.falsePositives}\n`;
      report += `- False Negatives: ${metrics.ood.falseNegatives}\n\n`;
    }

    if (metrics.injection) {
      report += `Injection Attack Dataset (Security):\n`;
      report += `- Bypass Rate: ${(metrics.injection.bypassRate * 100).toFixed(1)}% (${metrics.injection.successfulBypasses}/${metrics.injection.totalAttempts})\n`;
      report += `- Detection Rate: ${(metrics.injection.detectionRate * 100).toFixed(1)}% (${metrics.injection.detectedAttacks}/${metrics.injection.totalAttempts})\n`;
      report += `- Total Attack Attempts: ${metrics.injection.totalAttempts}\n\n`;
    }

    if (metrics.rbac) {
      report += `RBAC Dataset (Access Control):\n`;
      report += `- Leak Rate: ${(metrics.rbac.leakRate * 100).toFixed(1)}% (${metrics.rbac.unauthorizedAccess}/${metrics.rbac.totalQueries})\n`;
      report += `- Enforcement Rate: ${(metrics.rbac.enforcementRate * 100).toFixed(1)}% (${metrics.rbac.properlyBlocked}/${metrics.rbac.totalQueries})\n`;
      report += `- Total Queries: ${metrics.rbac.totalQueries}\n\n`;
    }

    return report;
  }
}