import { HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';
import { RerankerResult } from '../types/reranker.js';

/**
 * Multi-stage confidence tracking for RAG pipeline
 * Tracks quality at each stage and detects degradation
 */

export interface StageConfidence {
  /** Confidence score for this stage (0-1) */
  confidence: number;
  /** Quality score for this stage (0-1) */
  quality: number;
  /** Number of results at this stage */
  resultCount: number;
  /** Top score at this stage */
  topScore: number;
  /** Mean score at this stage */
  meanScore: number;
  /** Standard deviation of scores */
  stdDev: number;
  /** Stage-specific metadata */
  metadata?: Record<string, any>;
}

export interface QualityDegradationAlert {
  /** Which stage caused the degradation */
  stage: 'keyword' | 'fusion' | 'reranking';
  /** Severity of degradation (0-1, higher = worse) */
  severity: number;
  /** Description of the issue */
  description: string;
  /** Recommended action */
  recommendation: string;
  /** Previous stage confidence */
  previousConfidence: number;
  /** Current stage confidence */
  currentConfidence: number;
}

export interface SourceAwareConfidenceResult {
  /** Final confidence using source-aware calculation */
  finalConfidence: number;
  /** Confidence at each pipeline stage */
  stageConfidences: {
    vector: StageConfidence;
    keyword?: StageConfidence;
    fusion: StageConfidence;
    reranking?: StageConfidence;
    rawFusionResults?: HybridSearchResult[];
  };
  /** Quality degradation alerts */
  degradationAlerts: QualityDegradationAlert[];
  /** Recommended confidence strategy */
  recommendedStrategy: 'max_confidence' | 'adaptive_weighted' | 'conservative';
  /** Explanation of confidence calculation */
  explanation: string;
  /** Performance metrics */
  computationTime: number;
}

export interface SourceAwareConfidenceConfig {
  /** Threshold for quality degradation detection */
  degradationThreshold: number;
  /** Minimum confidence to use max-confidence strategy */
  maxConfidenceThreshold: number;
  /** Weights for adaptive strategy */
  adaptiveWeights: {
    vector: number;
    keyword: number;
    fusion: number;
    reranking: number;
  };
  /** Enable quality degradation alerts */
  enableDegradationAlerts: boolean;
}

export class SourceAwareConfidenceService {
  private defaultConfig: SourceAwareConfidenceConfig = {
    degradationThreshold: 0.3, // 30% degradation triggers alert
    maxConfidenceThreshold: 0.8, // 80% confidence in any stage triggers max strategy
    adaptiveWeights: {
      vector: 0.4,
      keyword: 0.2,
      fusion: 0.2,
      reranking: 0.2
    },
    enableDegradationAlerts: true
  };

  private finalConfig: SourceAwareConfidenceConfig;

  constructor(config: Partial<SourceAwareConfidenceConfig> = {}) {
    this.finalConfig = { ...this.defaultConfig, ...config };
  }

  /**
   * Calculate source-aware confidence for the entire RAG pipeline
   */
  calculateSourceAwareConfidence(
    vectorResults: VectorSearchResult[],
    keywordResults: HybridSearchResult[] = [],
    fusionResults: HybridSearchResult[] = [],
    rerankerResults: RerankerResult[] = []
  ): SourceAwareConfidenceResult {
    const startTime = performance.now();

    // Calculate confidence at each stage
    const vectorConfidence = this.calculateVectorStageConfidence(vectorResults);

    const keywordConfidence = keywordResults.length > 0
      ? this.calculateKeywordStageConfidence(keywordResults)
      : undefined;

    const fusionConfidence = this.calculateFusionStageConfidence(fusionResults, vectorConfidence);

    const rerankerConfidence = rerankerResults.length > 0
      ? this.calculateRerankerStageConfidence(rerankerResults)
      : undefined;

    // Detect quality degradation
    const degradationAlerts = this.detectQualityDegradation(
      vectorConfidence,
      keywordConfidence,
      fusionConfidence,
      rerankerConfidence
    );

    // Determine optimal confidence strategy
    const strategy = this.determineConfidenceStrategy(
      vectorConfidence,
      keywordConfidence,
      fusionConfidence,
      rerankerConfidence,
      degradationAlerts
    );

    // Calculate final confidence using chosen strategy
    const finalConfidence = this.calculateFinalConfidence(
      strategy,
      vectorConfidence,
      keywordConfidence,
      fusionConfidence,
      rerankerConfidence
    );

    const explanation = this.generateConfidenceExplanation(
      strategy,
      vectorConfidence,
      keywordConfidence,
      fusionConfidence,
      rerankerConfidence,
      degradationAlerts
    );

    const result = {
      finalConfidence,
      stageConfidences: {
        vector: vectorConfidence,
        keyword: keywordConfidence,
        fusion: fusionConfidence,
        reranking: rerankerConfidence,
        rawFusionResults: fusionResults
      },
      degradationAlerts,
      recommendedStrategy: strategy,
      explanation,
      computationTime: performance.now() - startTime
    };

    return result;
  }

  private calculateVectorStageConfidence(results: VectorSearchResult[]): StageConfidence {
    if (results.length === 0) {
      return this.createEmptyStageConfidence();
    }

    const scores = results.map(r => r.score || 0);
    const stats = this.calculateScoreStatistics(scores);

    // Vector search confidence is directly based on similarity scores
    const confidence = Math.min(
      stats.max * 0.6 +
      stats.mean * 0.3 +
      this.calculateConsistencyScore(stats) * 0.1,
      1.0
    );

    return {
      confidence,
      quality: confidence,
      resultCount: results.length,
      topScore: stats.max,
      meanScore: stats.mean,
      stdDev: stats.stdDev,
      metadata: {
        stageType: 'vector',
        scoreDistribution: this.analyzeScoreDistribution(scores)
      }
    };
  }

  private calculateKeywordStageConfidence(results: HybridSearchResult[]): StageConfidence {
    if (results.length === 0) {
      return this.createEmptyStageConfidence();
    }

    const scores = results.map(r => r.score || 0);
    const stats = this.calculateScoreStatistics(scores);

    // Keyword search tends to have lower absolute scores but good relative ranking
    const confidence = Math.min(
      (stats.max / 2) * 0.5 +
      stats.mean * 0.3 +
      this.calculateConsistencyScore(stats) * 0.2,
      1.0
    );

    return {
      confidence,
      quality: confidence,
      resultCount: results.length,
      topScore: stats.max,
      meanScore: stats.mean,
      stdDev: stats.stdDev,
      metadata: {
        stageType: 'keyword',
        scoreDistribution: this.analyzeScoreDistribution(scores)
      }
    };
  }

  private calculateFusionStageConfidence(
    results: HybridSearchResult[],
    vectorStage: StageConfidence
  ): StageConfidence {
    if (results.length === 0) {
      return this.createEmptyStageConfidence();
    }

    const fusionScores = results.map(r => r.fusionScore || r.score || 0);
    const vectorScores = results.map(r => r.vectorScore || 0).filter(s => s > 0);
    const keywordScores = results.map(r => r.keywordScore || 0).filter(s => s > 0);

    const fusionStats = this.calculateScoreStatistics(fusionScores);
    const vectorStats = vectorScores.length > 0 ? this.calculateScoreStatistics(vectorScores) : null;

    // CRITICAL: Detect if fusion degraded vector quality
    let qualityPreservation = 1.0;
    let vectorToFusionRatio = 0;
    if (vectorStats && vectorStage.confidence > 0.7) {
      vectorToFusionRatio = vectorStats.max > 0 ? fusionStats.max / vectorStats.max : 0;
      qualityPreservation = Math.max(vectorToFusionRatio, 0.1);
    }

    // Fusion confidence considers both fusion scores and quality preservation
    const baseConfidence = Math.min(
      fusionStats.max * 0.4 +
      fusionStats.mean * 0.3 +
      this.calculateConsistencyScore(fusionStats) * 0.1,
      1.0
    );

    const confidence = baseConfidence * qualityPreservation;
    const quality = qualityPreservation;

    return {
      confidence,
      quality,
      resultCount: results.length,
      topScore: fusionStats.max,
      meanScore: fusionStats.mean,
      stdDev: fusionStats.stdDev,
      metadata: {
        stageType: 'fusion',
        qualityPreservation,
        vectorToFusionRatio,
        hybridTypes: this.analyzeHybridTypes(results)
      }
    };
  }

  private calculateRerankerStageConfidence(results: RerankerResult[]): StageConfidence {
    if (results.length === 0) {
      return this.createEmptyStageConfidence();
    }

    const scores = results.map(r => r.rerankerScore);
    const stats = this.calculateScoreStatistics(scores);

    // Reranker confidence based on score improvement and consistency
    const confidence = Math.min(
      stats.max * 0.5 +
      stats.mean * 0.3 +
      this.calculateConsistencyScore(stats) * 0.2,
      1.0
    );

    return {
      confidence,
      quality: confidence,
      resultCount: results.length,
      topScore: stats.max,
      meanScore: stats.mean,
      stdDev: stats.stdDev,
      metadata: {
        stageType: 'reranker',
        scoreDistribution: this.analyzeScoreDistribution(scores)
      }
    };
  }

  private detectQualityDegradation(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): QualityDegradationAlert[] {
    if (!this.finalConfig.enableDegradationAlerts) {
      return [];
    }

    const alerts: QualityDegradationAlert[] = [];
    const threshold = this.finalConfig.degradationThreshold;

    // Check vector → fusion degradation (most critical)
    if (fusion && vector.confidence > 0.5) {
      const degradation = (vector.confidence - fusion.confidence) / vector.confidence;
      if (degradation > threshold) {
        alerts.push({
          stage: 'fusion',
          severity: degradation,
          description: `Fusion stage reduced confidence by ${(degradation * 100).toFixed(1)}%`,
          recommendation: 'Consider using max-confidence strategy or adjusting RRF parameters',
          previousConfidence: vector.confidence,
          currentConfidence: fusion.confidence
        });
      }
    }

    // Check fusion → reranker degradation
    if (reranker && fusion && fusion.confidence > 0.5) {
      const degradation = (fusion.confidence - reranker.confidence) / fusion.confidence;
      if (degradation > threshold) {
        alerts.push({
          stage: 'reranking',
          severity: degradation,
          description: `Reranker reduced confidence by ${(degradation * 100).toFixed(1)}%`,
          recommendation: 'Consider disabling reranker for this query type',
          previousConfidence: fusion.confidence,
          currentConfidence: reranker.confidence
        });
      }
    }

    return alerts;
  }

  private determineConfidenceStrategy(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence,
    degradationAlerts: QualityDegradationAlert[] = []
  ): 'max_confidence' | 'adaptive_weighted' | 'conservative' {
    const maxThreshold = this.finalConfig.maxConfidenceThreshold;

    // Use max-confidence if any stage is highly confident and there's degradation
    if (vector.confidence >= maxThreshold && degradationAlerts.length > 0) {
      return 'max_confidence';
    }

    if (keyword && keyword.confidence >= maxThreshold && degradationAlerts.length > 0) {
      return 'max_confidence';
    }

    // Use conservative if all stages are low confidence
    const allConfidences = [vector.confidence];
    if (keyword) allConfidences.push(keyword.confidence);
    if (fusion) allConfidences.push(fusion.confidence);
    if (reranker) allConfidences.push(reranker.confidence);

    const avgConfidence = allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length;
    if (avgConfidence < 0.3) {
      return 'conservative';
    }

    // Default to adaptive weighted approach
    return 'adaptive_weighted';
  }

  private calculateFinalConfidence(
    strategy: 'max_confidence' | 'adaptive_weighted' | 'conservative',
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): number {
    switch (strategy) {
      case 'max_confidence':
        return this.calculateMaxConfidence(vector, keyword, fusion, reranker);

      case 'adaptive_weighted':
        // If there's degradation from vector to fusion, lean towards vector confidence more
        if (fusion?.metadata?.qualityPreservation !== undefined && fusion.metadata.qualityPreservation < this.finalConfig.degradationThreshold) {
          return this.calculateAdjustedAdaptiveWeightedConfidence(vector, keyword, fusion, reranker);
        }
        return this.calculateAdaptiveWeightedConfidence(vector, keyword, fusion, reranker);

      case 'conservative':
        return this.calculateConservativeConfidence(vector, keyword, fusion, reranker);

      default:
        return this.calculateAdaptiveWeightedConfidence(vector, keyword, fusion, reranker);
    }
  }

  private calculateMaxConfidence(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): number {
    // Return the highest confidence among all stages
    const confidences = [vector.confidence];
    if (keyword) confidences.push(keyword.confidence);
    if (fusion) confidences.push(fusion.confidence);
    if (reranker) confidences.push(reranker.confidence);

    return Math.max(...confidences);
  }

  private calculateAdaptiveWeightedConfidence(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): number {
    const weights = this.finalConfig.adaptiveWeights;
    let totalWeight = weights.vector;
    let weightedSum = vector.confidence * weights.vector;

    // Adjust weights based on stage quality
    if (keyword) {
      const adjustedKeywordWeight = weights.keyword * keyword.quality;
      weightedSum += keyword.confidence * adjustedKeywordWeight;
      totalWeight += adjustedKeywordWeight;
    }

    if (fusion) {
      const adjustedFusionWeight = weights.fusion * fusion.quality;
      weightedSum += fusion.confidence * adjustedFusionWeight;
      totalWeight += adjustedFusionWeight;
    }

    if (reranker) {
      const adjustedRerankerWeight = weights.reranking * reranker.quality;
      weightedSum += reranker.confidence * adjustedRerankerWeight;
      totalWeight += adjustedRerankerWeight;
    }

    // Ensure totalWeight is not zero to prevent division by zero
    return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1.0) : 0;
  }

  // A variant for adaptive weighted that gives more weight to vector if fusion degrades
  private calculateAdjustedAdaptiveWeightedConfidence(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): number {
    const weights = this.finalConfig.adaptiveWeights;
    let totalWeight = weights.vector * 1.5; // Give more weight to vector
    let weightedSum = vector.confidence * weights.vector * 1.5;

    if (keyword) {
      const adjustedKeywordWeight = weights.keyword * keyword.quality;
      weightedSum += keyword.confidence * adjustedKeywordWeight;
      totalWeight += adjustedKeywordWeight;
    }

    if (fusion) { // Reduce fusion weight if it degraded
      const adjustedFusionWeight = weights.fusion * fusion.quality * 0.5; // Reduced weight
      weightedSum += fusion.confidence * adjustedFusionWeight;
      totalWeight += adjustedFusionWeight;
    }

    if (reranker) {
      const adjustedRerankerWeight = weights.reranking * reranker.quality;
      weightedSum += reranker.confidence * adjustedRerankerWeight;
      totalWeight += adjustedRerankerWeight;
    }

    return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1.0) : 0;
  }

  private calculateConservativeConfidence(
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence
  ): number {
    // Use the minimum confidence among all stages (most conservative)
    const confidences = [vector.confidence];
    if (keyword) confidences.push(keyword.confidence);
    if (fusion) confidences.push(fusion.confidence);
    if (reranker) confidences.push(reranker.confidence);

    return Math.min(...confidences);
  }

  private generateConfidenceExplanation(
    strategy: string,
    vector: StageConfidence,
    keyword?: StageConfidence,
    fusion?: StageConfidence,
    reranker?: StageConfidence,
    degradationAlerts: QualityDegradationAlert[] = []
  ): string {
    let explanation = `Used ${strategy.replace('_', ' ')} strategy. `;

    explanation += `Vector: ${(vector.confidence * 100).toFixed(1)}%`;
    if (keyword) explanation += `, Keyword: ${(keyword.confidence * 100).toFixed(1)}%`;
    if (fusion) explanation += `, Fusion: ${(fusion.confidence * 100).toFixed(1)}%`;
    if (reranker) explanation += `, Reranker: ${(reranker.confidence * 100).toFixed(1)}%`;

    if (degradationAlerts.length > 0) {
      explanation += `. Alerts: ${degradationAlerts.map(a => a.description).join(', ')}`;
    }

    return explanation;
  }

  // Helper methods for calculating score statistics
  private calculateScoreStatistics(scores: number[]) {
    if (scores.length === 0) {
      return { max: 0, mean: 0, stdDev: 0, count: 0 };
    }

    const max = Math.max(...scores);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    return { max, mean, stdDev, count: scores.length };
  }

  private calculateConsistencyScore(stats: { stdDev: number; mean: number }): number {
    if (stats.mean === 0) return 0;
    const coefficientOfVariation = stats.stdDev / stats.mean;
    return Math.max(0, 1 - coefficientOfVariation);
  }

  private analyzeScoreDistribution(scores: number[]) {
    if (scores.length === 0) return { topQuartileAvg: 0, range: 0, count: 0 };
    const sorted = [...scores].sort((a, b) => b - a);
    return {
      topQuartileAvg: sorted.slice(0, Math.ceil(sorted.length / 4)).reduce((sum, s) => sum + s, 0) / Math.ceil(sorted.length / 4),
      range: sorted[0] - sorted[sorted.length - 1],
      count: scores.length
    };
  }

  private analyzeHybridTypes(results: HybridSearchResult[]) {
    const types = results.map(r => r.searchType || 'unknown');
    const counts = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return counts;
  }

  private createEmptyStageConfidence(): StageConfidence {
    return {
      confidence: 0,
      quality: 0,
      resultCount: 0,
      topScore: 0,
      meanScore: 0,
      stdDev: 0
    };
  }
}

/**
 * Factory function for creating source-aware confidence service
 */
export function createSourceAwareConfidenceService(
  config?: Partial<SourceAwareConfidenceConfig>
): SourceAwareConfidenceService {
  return new SourceAwareConfidenceService(config);
}