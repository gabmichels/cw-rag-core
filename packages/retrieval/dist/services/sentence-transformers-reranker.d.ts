import { BaseRerankerService } from './reranker.js';
import { RerankerRequest, RerankerResult, RerankerConfig } from '../types/reranker.js';
/**
 * Node.js-based reranker service using @xenova/transformers for cross-encoder models
 */
export declare class SentenceTransformersRerankerService extends BaseRerankerService {
    private pipeline;
    private isInitializing;
    constructor(config: RerankerConfig);
    rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    private initializePipeline;
    private processBatch;
    private prepareInput;
    private extractRelevanceScore;
    isHealthy(): Promise<boolean>;
    getSupportedModels(): string[];
}
