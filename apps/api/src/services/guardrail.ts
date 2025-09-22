import { UserContext } from '@cw-rag-core/shared';

export interface SimpleAnswerabilityScore {
  confidence: number;
  isAnswerable: boolean;
  reasoning: string;
  scoreStats: {
    mean: number;
    max: number;
    min: number;
    count: number;
  };
}

export interface GuardrailConfig {
  enabled: boolean;
  minConfidence: number;
  minTopScore: number;
  minMeanScore: number;
  minResultCount: number;
}

export interface IdkTemplateResponse {
  message: string;
  reasonCode: string;
  suggestions?: string[];
}

export class SimpleGuardrailService {
  private tenantConfigs = new Map<string, GuardrailConfig>();

  constructor() {
    this.initializeDefaultConfigs();
  }

  evaluateAnswerability(
    query: string,
    searchResults: any[],
    userContext: UserContext
  ): {
    isAnswerable: boolean;
    score: SimpleAnswerabilityScore;
    idkResponse?: IdkTemplateResponse;
  } {
    const config = this.getTenantConfig(userContext.tenantId || 'default');

    // If guardrail is disabled, always return answerable
    if (!config.enabled) {
      return {
        isAnswerable: true,
        score: {
          confidence: 1.0,
          isAnswerable: true,
          reasoning: 'Guardrail disabled',
          scoreStats: { mean: 1.0, max: 1.0, min: 1.0, count: searchResults.length }
        }
      };
    }

    // Calculate answerability score
    const score = this.calculateScore(searchResults);

    // Apply threshold decision
    const isAnswerable = this.applyThresholds(score, config);

    return {
      isAnswerable,
      score,
      idkResponse: isAnswerable ? undefined : this.generateIdkResponse(score, query)
    };
  }

  private calculateScore(searchResults: any[]): SimpleAnswerabilityScore {
    if (searchResults.length === 0) {
      return {
        confidence: 0,
        isAnswerable: false,
        reasoning: 'No search results found',
        scoreStats: { mean: 0, max: 0, min: 0, count: 0 }
      };
    }

    // Extract scores from search results
    const scores = searchResults.map(result => result.score || 0);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);

    // Calculate confidence based on score statistics
    const confidence = this.calculateConfidence(mean, max, min, scores.length);

    return {
      confidence,
      isAnswerable: confidence > 0.5,
      reasoning: this.generateReasoning(mean, max, min, scores.length),
      scoreStats: { mean, max, min, count: scores.length }
    };
  }

  private calculateConfidence(mean: number, max: number, min: number, count: number): number {
    // Simple confidence calculation based on score statistics
    const meanWeight = 0.4;
    const maxWeight = 0.3;
    const consistencyWeight = 0.2;
    const countWeight = 0.1;

    // Normalize scores
    const normalizedMean = Math.min(mean, 1.0);
    const normalizedMax = Math.min(max, 1.0);

    // Consistency score (higher when scores are similar)
    const range = max - min;
    const consistencyScore = range > 0 ? Math.max(0, 1 - (range / 0.8)) : 1.0;

    // Count score (more results = higher confidence, up to a point)
    const countScore = Math.min(count / 5, 1.0);

    return (normalizedMean * meanWeight) +
           (normalizedMax * maxWeight) +
           (consistencyScore * consistencyWeight) +
           (countScore * countWeight);
  }

  private applyThresholds(score: SimpleAnswerabilityScore, config: GuardrailConfig): boolean {
    return score.confidence >= config.minConfidence &&
           score.scoreStats.max >= config.minTopScore &&
           score.scoreStats.mean >= config.minMeanScore &&
           score.scoreStats.count >= config.minResultCount;
  }

  private generateIdkResponse(score: SimpleAnswerabilityScore, query: string): IdkTemplateResponse {
    if (score.scoreStats.count === 0) {
      return {
        message: "I couldn't find any relevant information in the knowledge base to answer your question.",
        reasonCode: 'NO_RELEVANT_DOCS',
        suggestions: [
          'Try rephrasing your question with different keywords',
          'Check if your question is within the scope of the available knowledge base',
          'Consider breaking down complex questions into simpler parts'
        ]
      };
    }

    if (score.confidence < 0.5) {
      return {
        message: "I don't have enough confidence in the available information to provide a reliable answer to your question.",
        reasonCode: 'LOW_CONFIDENCE',
        suggestions: [
          'Try being more specific in your question',
          'Include additional context or details',
          'Verify that the information you\'re looking for is available in the knowledge base'
        ]
      };
    }

    return {
      message: "The available information doesn't provide a clear answer to your question.",
      reasonCode: 'UNCLEAR_ANSWER',
      suggestions: [
        'Try rephrasing your question more specifically',
        'Consider asking about related topics that might be covered'
      ]
    };
  }

  private generateReasoning(mean: number, max: number, min: number, count: number): string {
    const issues = [];

    if (count === 0) issues.push('no results found');
    if (mean < 0.3) issues.push('low average relevance');
    if (max < 0.5) issues.push('low maximum relevance');
    if (count < 2) issues.push('insufficient result diversity');

    return issues.length > 0 ?
      `Low confidence due to: ${issues.join(', ')}` :
      'Sufficient confidence in search results';
  }

  private getTenantConfig(tenantId: string): GuardrailConfig {
    return this.tenantConfigs.get(tenantId) || this.getDefaultConfig();
  }

  private getDefaultConfig(): GuardrailConfig {
    return {
      enabled: true,
      minConfidence: 0.6,
      minTopScore: 0.5,
      minMeanScore: 0.3,
      minResultCount: 2
    };
  }

  private initializeDefaultConfigs(): void {
    // Initialize common tenant configurations
    this.tenantConfigs.set('default', this.getDefaultConfig());

    // Strict configuration for enterprise
    this.tenantConfigs.set('enterprise', {
      enabled: true,
      minConfidence: 0.8,
      minTopScore: 0.7,
      minMeanScore: 0.5,
      minResultCount: 3
    });

    // Permissive configuration for development
    this.tenantConfigs.set('dev', {
      enabled: true,
      minConfidence: 0.4,
      minTopScore: 0.3,
      minMeanScore: 0.2,
      minResultCount: 1
    });
  }

  updateTenantConfig(tenantId: string, config: GuardrailConfig): void {
    this.tenantConfigs.set(tenantId, config);
  }
}

// Export singleton instance
export const guardrailService = new SimpleGuardrailService();