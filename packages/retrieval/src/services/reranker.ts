import {
  RerankerRequest,
  RerankerResult,
  RerankerConfig,
  RerankerPerformanceMetrics,
  RerankerDocument
} from '../types/reranker.js';

export interface RerankerService {
  /**
   * Rerank documents based on their relevance to the query
   */
  rerank(request: RerankerRequest): Promise<RerankerResult[]>;

  /**
   * Rerank documents with performance metrics
   */
  rerankWithMetrics(request: RerankerRequest): Promise<{
    results: RerankerResult[];
    metrics: RerankerPerformanceMetrics;
  }>;

  /**
   * Get the configuration for this reranker service
   */
  getConfig(): RerankerConfig;

  /**
   * Update the configuration for this reranker service
   */
  updateConfig(config: Partial<RerankerConfig>): void;

  /**
   * Check if the reranker service is available
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get supported models
   */
  getSupportedModels(): string[];
}

export abstract class BaseRerankerService implements RerankerService {
  protected config: RerankerConfig;

  constructor(config: RerankerConfig) {
    this.config = { ...config };
  }

  abstract rerank(request: RerankerRequest): Promise<RerankerResult[]>;

  async rerankWithMetrics(request: RerankerRequest): Promise<{
    results: RerankerResult[];
    metrics: RerankerPerformanceMetrics;
  }> {
    const startTime = performance.now();
    const modelLoadStart = performance.now();

    // Perform reranking
    const results = await this.rerank(request);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Calculate performance metrics
    const metrics: RerankerPerformanceMetrics = {
      rerankerDuration: duration,
      documentsProcessed: request.documents.length,
      modelLoadDuration: modelLoadStart ? endTime - modelLoadStart : undefined,
      batchCount: Math.ceil(request.documents.length / (this.config.batchSize || 20)),
      avgScoreImprovement: this.calculateAvgScoreImprovement(request.documents, results)
    };

    return { results, metrics };
  }

  getConfig(): RerankerConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RerankerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  abstract isHealthy(): Promise<boolean>;
  abstract getSupportedModels(): string[];

  /**
   * Normalize scores to 0-1 range
   */
  protected normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) return [];

    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    if (range === 0) {
      return scores.map(() => 1.0);
    }

    return scores.map(score => (score - minScore) / range);
  }

  /**
   * Apply score threshold filtering
   */
  protected applyScoreThreshold(results: RerankerResult[]): RerankerResult[] {
    if (!this.config.scoreThreshold) return results;

    return results.filter(result => result.rerankerScore >= this.config.scoreThreshold!);
  }

  /**
   * Apply top-K filtering
   */
  protected applyTopK(results: RerankerResult[]): RerankerResult[] {
    if (!this.config.topK) return results;

    return results.slice(0, this.config.topK);
  }

  /**
   * Calculate average score improvement from reranking
   */
  private calculateAvgScoreImprovement(
    documents: RerankerDocument[],
    results: RerankerResult[]
  ): number {
    const docMap = new Map(documents.map(doc => [doc.id, doc.originalScore || 0]));
    let totalImprovement = 0;
    let count = 0;

    for (const result of results) {
      const originalScore = docMap.get(result.id);
      if (originalScore !== undefined) {
        totalImprovement += Math.abs(result.rerankerScore - originalScore);
        count++;
      }
    }

    return count > 0 ? totalImprovement / count : 0;
  }

  /**
   * Pass-through implementation when reranking is disabled or fails
   */
  protected passThrough(request: RerankerRequest): RerankerResult[] {
    return request.documents.map((doc, index) => ({
      id: doc.id,
      score: doc.originalScore || 0.5,
      content: doc.content,
      payload: doc.payload,
      originalScore: doc.originalScore,
      rerankerScore: doc.originalScore || 0.5,
      rank: index + 1
    }));
  }

  /**
   * Create batch groups for processing
   */
  protected createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Retry logic for failed operations
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.config.retryAttempts || 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts) {
          throw lastError;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}