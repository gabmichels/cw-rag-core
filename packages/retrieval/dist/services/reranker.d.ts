import { RerankerRequest, RerankerResult, RerankerConfig, RerankerPerformanceMetrics } from '../types/reranker.js';
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
export declare abstract class BaseRerankerService implements RerankerService {
    protected config: RerankerConfig;
    constructor(config: RerankerConfig);
    abstract rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    rerankWithMetrics(request: RerankerRequest): Promise<{
        results: RerankerResult[];
        metrics: RerankerPerformanceMetrics;
    }>;
    getConfig(): RerankerConfig;
    updateConfig(config: Partial<RerankerConfig>): void;
    abstract isHealthy(): Promise<boolean>;
    abstract getSupportedModels(): string[];
    /**
     * Normalize scores to 0-1 range
     */
    protected normalizeScores(scores: number[]): number[];
    /**
     * Apply score threshold filtering
     */
    protected applyScoreThreshold(results: RerankerResult[]): RerankerResult[];
    /**
     * Apply top-K filtering
     */
    protected applyTopK(results: RerankerResult[]): RerankerResult[];
    /**
     * Calculate average score improvement from reranking
     */
    private calculateAvgScoreImprovement;
    /**
     * Pass-through implementation when reranking is disabled or fails
     */
    protected passThrough(request: RerankerRequest): RerankerResult[];
    /**
     * Create batch groups for processing
     */
    protected createBatches<T>(items: T[], batchSize: number): T[][];
    /**
     * Retry logic for failed operations
     */
    protected withRetry<T>(operation: () => Promise<T>, maxAttempts?: number): Promise<T>;
}
