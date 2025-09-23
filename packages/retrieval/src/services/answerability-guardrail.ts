import {
  AnswerabilityScore,
  ScoreStatistics,
  AlgorithmScores,
  AnswerabilityThreshold,
  TenantGuardrailConfig,
  GuardrailDecision,
  IdkResponse,
  GuardrailAuditTrail,
  DEFAULT_GUARDRAIL_CONFIG,
  DEFAULT_IDK_TEMPLATES
} from '../types/guardrail.js';
import { HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';
import { RerankerResult } from '../types/reranker.js';
import { UserContext } from '@cw-rag-core/shared';
import {
  SourceAwareConfidenceService,
  SourceAwareConfidenceResult, // Correct import for SourceAwareConfidenceResult
  createSourceAwareConfidenceService
} from './source-aware-confidence.js';

export interface AnswerabilityGuardrailService {
  /**
   * Evaluate if a query is answerable based on retrieval results.
   * Accepts structured retrieval results for source-aware confidence.
   */
  evaluateAnswerability(
    query: string,
    retrievalResults: {
      vectorResults: VectorSearchResult[];
      keywordResults: HybridSearchResult[];
      fusionResults: HybridSearchResult[];
      rerankerResults?: RerankerResult[];
    },
    userContext: UserContext,
    metrics?: SearchPerformanceMetrics
  ): Promise<GuardrailDecision>;

  /**
   * Calculate answerability score from structured retrieval results
   * using the SourceAwareConfidenceService.
   */
  calculateAnswerabilityScore(
    retrievalResults: {
      vectorResults: VectorSearchResult[];
      keywordResults: HybridSearchResult[];
      fusionResults: HybridSearchResult[];
      rerankerResults?: RerankerResult[];
    }
  ): AnswerabilityScore;

  /**
   * Get tenant-specific guardrail configuration.
   */
  getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;

  /**
   * Update tenant guardrail configuration.
   */
  updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;

  /**
   * Generate IDK response based on score and configuration.
   * This method still needs a flat list of results for generating suggestions.
   */
  generateIdkResponse(
    score: AnswerabilityScore,
    config: TenantGuardrailConfig,
    results: HybridSearchResult[]
  ): IdkResponse;
}

export class AnswerabilityGuardrailServiceImpl implements AnswerabilityGuardrailService {
  private tenantConfigs = new Map<string, TenantGuardrailConfig>();
  private sourceAwareConfidenceService: SourceAwareConfidenceService;

  constructor() {
    this.initializeDefaultConfigs();
    this.sourceAwareConfidenceService = createSourceAwareConfidenceService();
  }

  async evaluateAnswerability(
    query: string,
    retrievalResults: {
      vectorResults: VectorSearchResult[];
      keywordResults: HybridSearchResult[];
      fusionResults: HybridSearchResult[];
      rerankerResults?: RerankerResult[];
    },
    userContext: UserContext,
    _metrics?: SearchPerformanceMetrics
  ): Promise<GuardrailDecision> {
    const startTime = performance.now();

    // Get tenant configuration
    const config = await this.getTenantConfig(userContext.tenantId || 'default');

    // Check if guardrail is enabled
    if (!config.enabled) {
      return {
        isAnswerable: true,
        score: this.createPassthroughScore(),
        threshold: config.threshold,
        // Use fusionResults for audit trail as it represents the overall documents considered for retrieval
        auditTrail: this.createAuditTrail(query, userContext, retrievalResults.fusionResults, 'GUARDRAIL_DISABLED', startTime)
      };
    }

    // Check bypass mode for admin users
    if (config.bypassEnabled && this.isAdminUser(userContext)) {
      return {
        isAnswerable: true,
        score: this.createPassthroughScore(),
        threshold: config.threshold,
        // Use fusionResults for audit trail
        auditTrail: this.createAuditTrail(query, userContext, retrievalResults.fusionResults, 'BYPASS_ENABLED', startTime)
      };
    }

    // Calculate answerability score using the new structured input
    const score = this.calculateAnswerabilityScore(retrievalResults);

    // Apply threshold decision logic
    const finalIsAnswerableDecision = this.applyThresholdDecision(score, config.threshold);

    // Update the isAnswerable property within the score object for consistency
    score.isAnswerable = finalIsAnswerableDecision;

    // Generate IDK response if not answerable
    const idkResponse = finalIsAnswerableDecision ? undefined : this.generateIdkResponse(score, config, retrievalResults.fusionResults);

    const decision: GuardrailDecision = {
      isAnswerable: finalIsAnswerableDecision,
      score,
      threshold: config.threshold,
      idkResponse,
      auditTrail: this.createAuditTrail(
        query,
        userContext,
        retrievalResults.fusionResults, // Use fusionResults for audit trail
        finalIsAnswerableDecision ? 'ANSWERABLE' : 'NOT_ANSWERABLE',
        startTime
      )
    };

    return decision;
  }

  calculateAnswerabilityScore({
    vectorResults,
    keywordResults,
    fusionResults,
    rerankerResults
  }: {
    vectorResults: VectorSearchResult[];
    keywordResults: HybridSearchResult[];
    fusionResults: HybridSearchResult[];
    rerankerResults?: RerankerResult[];
  }): AnswerabilityScore {
    const startTime = performance.now();

    if (fusionResults.length === 0 && vectorResults.length === 0 && keywordResults.length === 0) {
      return {
        confidence: 0,
        scoreStats: this.createEmptyStats(),
        algorithmScores: {
          statistical: 0,
          threshold: 0,
          mlFeatures: 0
        },
        isAnswerable: false,
        reasoning: 'No retrieval results found from any source',
        computationTime: performance.now() - startTime,
        sourceAwareConfidence: undefined
      };
    }

    // Calculate source-aware confidence
    const sourceAwareResult = this.sourceAwareConfidenceService.calculateSourceAwareConfidence(
      vectorResults,
      keywordResults,
      fusionResults,
      rerankerResults
    );

    // Map source-aware result to the existing AnswerabilityScore interface
    const confidence = sourceAwareResult.finalConfidence;

    // Combine all scores to calculate overall statistics (for legacy AlgorithmScores and stats)
    // We filter for values above 0 to avoid skewing statistics with default/zero scores,
    // reflecting truly contributing results.
    const allScores: number[] = [
      ...vectorResults.map(r => r.score || 0),
      ...keywordResults.map(r => r.score || 0),
      ...fusionResults.map(r => r.fusionScore || r.score || 0),
      ...(rerankerResults?.map(r => r.rerankerScore) || [])
    ].filter(s => s !== undefined && s > 0) as number[];

    const scoreStats = this.calculateScoreStatistics(allScores);

    // Populate algorithmScores with values from source-aware stages
    // These reflect confidence at specific stages, not simply raw scores
    const algorithmScores: AlgorithmScores = {
      statistical: sourceAwareResult.stageConfidences.vector?.confidence || 0,
      threshold: sourceAwareResult.stageConfidences.fusion?.confidence || 0,
      mlFeatures: sourceAwareResult.stageConfidences.fusion?.confidence || 0, // Using fusion for ML score for now
      rerankerConfidence: sourceAwareResult.stageConfidences.reranking?.confidence
    };

    // Removed debug console.log for SourceAwareConfidenceResult
    return {
      confidence,
      scoreStats,
      algorithmScores,
      isAnswerable: false, // Reverted to default; `evaluateAnswerability` will set the definitive flag.
      reasoning: sourceAwareResult.explanation,
      computationTime: performance.now() - startTime,
      sourceAwareConfidence: sourceAwareResult
    };
  }

  async getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig> {
    const config = this.tenantConfigs.get(tenantId);
    if (!config) {
      return this.getDefaultConfig(tenantId);
    }
    return config;
  }

  async updateTenantConfig(config: TenantGuardrailConfig): Promise<void> {
    this.tenantConfigs.set(config.tenantId, config);

    // Clear related cache entries (if any) or invalidate configs
    const tenantCacheKey = `tenant-config:${config.tenantId}`;
    // example: this.someConfigCache.delete(tenantCacheKey);
  }

  generateIdkResponse(
    score: AnswerabilityScore,
    config: TenantGuardrailConfig,
    results: HybridSearchResult[]
  ): IdkResponse {
    // Determine appropriate template based on score characteristics
    const template = this.selectIdkTemplate(score, config);

    // Generate suggestions if enabled
    const suggestions = template.includeSuggestions ?
      this.generateFallbackSuggestions(results, config.fallbackConfig) : undefined;

    return {
      message: template.template,
      reasonCode: template.reasonCode,
      suggestions,
      confidenceLevel: score.confidence
    };
  }

  private calculateScoreStatistics(scores: number[]): ScoreStatistics {
    if (scores.length === 0) {
      return this.createEmptyStats();
    }

    const sortedScores = [...scores].sort((a, b) => a - b);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      max: Math.max(...scores),
      min: Math.min(...scores),
      stdDev,
      count: scores.length,
      percentiles: {
        p25: this.calculatePercentile(sortedScores, 0.25),
        p50: this.calculatePercentile(sortedScores, 0.50),
        p75: this.calculatePercentile(sortedScores, 0.75),
        p90: this.calculatePercentile(sortedScores, 0.90)
      }
    };
  }

  private calculateStatisticalScore(stats: ScoreStatistics): number {
    if (stats.count === 0) return 0;

    // Statistical confidence based on score distribution
    const meanWeight = 0.4;
    const maxWeight = 0.3;
    const consistencyWeight = 0.3;

    // Normalize mean and max scores
    const normalizedMean = Math.min(stats.mean, 1.0);
    const normalizedMax = Math.min(stats.max, 1.0);

    // Consistency score (lower std dev = higher consistency = higher confidence)
    const consistencyScore = stats.stdDev > 0 ? Math.max(0, 1 - (stats.stdDev / 0.5)) : 1.0;

    return (normalizedMean * meanWeight) +
           (normalizedMax * maxWeight) +
           (consistencyScore * consistencyWeight);
  }

  private calculateThresholdScore(scores: number[]): number {
    if (scores.length === 0) return 0;

    // Simple threshold-based scoring
    const topScore = Math.max(...scores);
    const aboveThreshold = scores.filter(s => s > 0.5).length;
    const ratioAboveThreshold = aboveThreshold / scores.length;

    return Math.min(topScore * 0.7 + ratioAboveThreshold * 0.3, 1.0);
  }

  private calculateMLFeaturesScore(
    stats: ScoreStatistics,
    vectorScores: number[],
    keywordScores: number[]
  ): number {
    if (stats.count === 0) return 0;

    // ML-ready feature scoring
    const features = {
      scoreRange: stats.max - stats.min,
      scoreVariance: stats.stdDev,
      topScoreRatio: stats.max / (stats.mean + 0.001), // Avoid division by zero
      vectorKeywordAlignment: this.calculateVectorKeywordAlignment(vectorScores, keywordScores),
      resultDensity: Math.min(stats.count / 10, 1.0) // Normalize count to 0-1
    };

    // Weighted combination of features
    return Math.min(
      (features.scoreRange * 0.2) +
      ((1 - Math.min(features.scoreVariance, 1.0)) * 0.3) +
      (Math.min(features.topScoreRatio / 2, 1.0) * 0.3) +
      (features.vectorKeywordAlignment * 0.1) +
      (features.resultDensity * 0.1),
      1.0
    );
  }

  private calculateRerankerConfidenceScore(rerankerScores: number[]): number {
    if (rerankerScores.length === 0) return 0;

    const topRerankerScore = Math.max(...rerankerScores);
    const meanRerankerScore = rerankerScores.reduce((sum, s) => sum + s, 0) / rerankerScores.length;

    // Reranker confidence based on top score and mean
    return Math.min(topRerankerScore * 0.6 + meanRerankerScore * 0.4, 1.0);
  }

  private calculateVectorKeywordAlignment(vectorScores: number[], keywordScores: number[]): number {
    if (vectorScores.length === 0 || keywordScores.length === 0) return 0.5;

    // Calculate correlation between vector and keyword scores
    const minLength = Math.min(vectorScores.length, keywordScores.length);
    const vector = vectorScores.slice(0, minLength);
    const keyword = keywordScores.slice(0, minLength);

    if (minLength === 0) return 0.5;

    const vectorMean = vector.reduce((sum, s) => sum + s, 0) / vector.length;
    const keywordMean = keyword.reduce((sum, s) => sum + s, 0) / keyword.length;

    let correlation = 0;
    let vectorVar = 0;
    let keywordVar = 0;

    for (let i = 0; i < minLength; i++) {
      const vectorDiff = vector[i] - vectorMean;
      const keywordDiff = keyword[i] - keywordMean;
      correlation += vectorDiff * keywordDiff;
      vectorVar += vectorDiff * vectorDiff;
      keywordVar += keywordDiff * keywordVar;
    }

    const denominator = Math.sqrt(vectorVar * keywordVar);
    if (denominator === 0) return 0.5;

    // Convert correlation (-1 to 1) to confidence score (0 to 1)
    return (correlation / denominator + 1) / 2;
  }

  private calculateEnsembleConfidence(algorithmScores: AlgorithmScores): number {
    // Use default weights if not specified
    const weights = {
      statistical: 0.4,
      threshold: 0.3,
      mlFeatures: 0.2,
      rerankerConfidence: 0.1
    };

    let totalWeight = weights.statistical + weights.threshold + weights.mlFeatures;
    let confidence =
      (algorithmScores.statistical * weights.statistical) +
      (algorithmScores.threshold * weights.threshold) +
      (algorithmScores.mlFeatures * weights.mlFeatures);

    // Add reranker confidence if available
    if (algorithmScores.rerankerConfidence !== undefined) {
      confidence += algorithmScores.rerankerConfidence * weights.rerankerConfidence;
      totalWeight += weights.rerankerConfidence;
    }

    return confidence / totalWeight;
  }

  private applyThresholdDecision(score: AnswerabilityScore, threshold: AnswerabilityThreshold): boolean {
    // Multiple criteria must be met for answerability
    const checks = [
      // Crucial check: overall confidence must meet the minimum threshold
      score.confidence >= threshold.minConfidence,
      score.scoreStats.max >= threshold.minTopScore,
      score.scoreStats.mean >= threshold.minMeanScore,
      score.scoreStats.stdDev <= threshold.maxStdDev,
      score.scoreStats.count >= threshold.minResultCount
    ];

    return checks.every(check => check);
  }

  private selectIdkTemplate(score: AnswerabilityScore, config: TenantGuardrailConfig): any {
    const templates = config.idkTemplates || DEFAULT_IDK_TEMPLATES;

    // Select template based on failure reason
    if (score.scoreStats.count === 0) {
      return templates.find(t => t.reasonCode === 'NO_RELEVANT_DOCS') || templates[0];
    }

    if (score.confidence < 0.3) {
      return templates.find(t => t.reasonCode === 'LOW_CONFIDENCE') || templates[0];
    }

    if (score.scoreStats.stdDev > 0.4) {
      return templates.find(t => t.reasonCode === 'AMBIGUOUS_QUERY') || templates[0];
    }

    // Default to low confidence template
    return templates.find(t => t.reasonCode === 'LOW_CONFIDENCE') || templates[0];
  }

  private generateFallbackSuggestions(
    results: HybridSearchResult[],
    fallbackConfig?: any
  ): string[] {
    if (!fallbackConfig?.enabled || results.length === 0) {
      return [];
    }

    const maxSuggestions = fallbackConfig.maxSuggestions || 3;
    const threshold = fallbackConfig.suggestionThreshold || 0.3;

    // Filter results above suggestion threshold and extract meaningful suggestions
    const candidateResults = results
      .filter(r => (r.fusionScore || r.score || 0) >= threshold)
      .slice(0, maxSuggestions);

    return candidateResults.map(result => {
      // Extract potential suggestion from document content
      const content = result.content || '';
      const firstSentence = content.split('.')[0]?.trim();

      if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
        return `Try asking about: "${firstSentence}..."`;
      }

      // Fallback to generic suggestion
      return `Consider refining your query to be more specific`;
    }).filter((suggestion, index, arr) => arr.indexOf(suggestion) === index); // Remove duplicates
  }

  private createAuditTrail(
    query: string,
    userContext: UserContext,
    results: HybridSearchResult[],
    decision: string,
    startTime: number
  ): GuardrailAuditTrail {
    const endTime = performance.now();

    return {
      timestamp: new Date().toISOString(),
      query,
      tenantId: userContext.tenantId || 'default',
      userContext: JSON.stringify({
        id: userContext.id,
        tenantId: userContext.tenantId,
        groupIds: userContext.groupIds
      }),
      retrievalResultsCount: results.length,
      scoreStatsSummary: results.length > 0 ?
        `mean=${results.reduce((sum, r) => sum + (r.fusionScore || r.score || 0), 0) / results.length}` :
        'no_results',
      decisionRationale: decision,
      performanceMetrics: {
        scoringDuration: endTime - startTime,
        totalDuration: endTime - startTime
      }
    };
  }

  private calculatePercentile(sortedScores: number[], percentile: number): number {
    if (sortedScores.length === 0) return 0;

    const index = percentile * (sortedScores.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedScores[lower];
    }

    const weight = index - lower;
    return sortedScores[lower] * (1 - weight) + sortedScores[upper] * weight;
  }

  private createEmptyStats(): ScoreStatistics {
    return {
      mean: 0,
      max: 0,
      min: 0,
      stdDev: 0,
      count: 0,
      percentiles: { p25: 0, p50: 0, p75: 0, p90: 0 }
    };
  }

  private createPassthroughScore(): AnswerabilityScore {
    return {
      confidence: 1.0,
      scoreStats: this.createEmptyStats(),
      algorithmScores: {
        statistical: 1.0,
        threshold: 1.0,
        mlFeatures: 1.0,
        rerankerConfidence: 1.0
      },
      isAnswerable: true,
      reasoning: 'Guardrail disabled or bypassed',
      computationTime: 0
    };
  }

  private isAdminUser(userContext: UserContext): boolean {
    // Check if user has admin privileges
    return userContext.groupIds?.includes('admin') ||
           userContext.groupIds?.includes('system') ||
           userContext.id?.includes('admin');
  }

  private generateScoreReasoning(stats: ScoreStatistics, algorithms: AlgorithmScores): string {
    const reasons = [];

    if (stats.count === 0) {
      reasons.push('No retrieval results');
    } else {
      if (stats.mean < 0.3) reasons.push('Low mean score');
      if (stats.max < 0.5) reasons.push('Low maximum score');
      if (stats.stdDev > 0.4) reasons.push('High score variance');
      if (algorithms.statistical < 0.5) reasons.push('Poor statistical confidence');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Sufficient confidence in results';
  }

  private initializeDefaultConfigs(): void {
    // Use dynamic config creation instead of static DEFAULT_GUARDRAIL_CONFIG
    this.tenantConfigs.set('default', this.getDefaultConfig('default'));
  }

  private getDefaultConfig(tenantId: string): TenantGuardrailConfig {
    const envThreshold = parseFloat(process.env.ANSWERABILITY_THRESHOLD || '0.6');

    let threshold;
    // Ensure minConfidence is never exactly 0, even if envThreshold is 0.
    // A confidence of 0 means no relevant docs, which should never pass.
    const effectiveMinConfidence = Math.max(envThreshold, 0.001);

    if (effectiveMinConfidence <= 0.1) {
      threshold = {
        type: 'custom' as const,
        minConfidence: effectiveMinConfidence,
        minTopScore: 0.01,
        minMeanScore: 0.01,
        maxStdDev: 1.0,
        minResultCount: 1
      };
    } else {
      const baseThreshold = {
        minConfidence: 0.4,
        minTopScore: 0.3,
        minMeanScore: 0.2,
        maxStdDev: 0.5,
        minResultCount: 1
      };
      const scaleFactor = effectiveMinConfidence / 0.4;

      threshold = {
        type: 'custom' as const,
        minConfidence: effectiveMinConfidence,
        minTopScore: Math.min(baseThreshold.minTopScore * scaleFactor, 1.0),
        minMeanScore: Math.min(baseThreshold.minMeanScore * scaleFactor, 1.0),
        maxStdDev: baseThreshold.maxStdDev,
        minResultCount: baseThreshold.minResultCount
      };
    }

    return {
      tenantId,
      enabled: true,
      threshold,
      idkTemplates: DEFAULT_IDK_TEMPLATES,
      fallbackConfig: {
        enabled: true,
        maxSuggestions: 3,
        suggestionThreshold: 0.3
      },
      bypassEnabled: false,
      algorithmWeights: {
        statistical: 0.4,
        threshold: 0.3,
        mlFeatures: 0.2,
        rerankerConfidence: 0.1
      }
    };
  }
}

export function createAnswerabilityGuardrailService(): AnswerabilityGuardrailService {
  return new AnswerabilityGuardrailServiceImpl();
}

export class CachedAnswerabilityGuardrailService extends AnswerabilityGuardrailServiceImpl {
  private configCache = new Map<string, {
    config: TenantGuardrailConfig;
    timestamp: number;
  }>();

  private readonly CONFIG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  async getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig> {
    const cached = this.configCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < this.CONFIG_CACHE_TTL) {
      return cached.config;
    }
    const config = await super.getTenantConfig(tenantId);
    this.configCache.set(tenantId, {
      config,
      timestamp: Date.now()
    });
    return config;
  }

  async updateTenantConfig(config: TenantGuardrailConfig): Promise<void> {
    await super.updateTenantConfig(config);
    this.configCache.delete(config.tenantId);
  }
}