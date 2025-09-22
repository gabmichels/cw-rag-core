import { BaseRerankerService } from './reranker.js';
import { RerankerRequest, RerankerResult, RerankerConfig } from '../types/reranker.js';
/**
 * Node.js-based reranker service using @xenova/transformers for cross-encoder models
 * LocalRerankerService implementation with token capping and timeout handling
 */
export declare class SentenceTransformersRerankerService extends BaseRerankerService {
    private pipeline;
    private isInitializing;
    constructor(config: RerankerConfig);
    rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    private performReranking;
    private initializePipeline;
    private processBatch;
    private prepareInput;
    /**
     * Cap text to approximately specified number of tokens
     * Simple approximation: ~4 characters per token for English text
     */
    private capTokens;
    private extractRelevanceScore;
    isHealthy(): Promise<boolean>;
    getSupportedModels(): string[];
}
