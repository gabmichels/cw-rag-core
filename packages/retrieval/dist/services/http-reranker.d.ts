import { BaseRerankerService } from './reranker.js';
import { RerankerRequest, RerankerResult, RerankerConfig } from '../types/reranker.js';
/**
 * HTTP-based reranker service client
 * Similar to the embedding service pattern for remote reranker endpoints
 */
export declare class HttpRerankerService extends BaseRerankerService {
    private serviceUrl;
    private retryDelayMs;
    constructor(config: RerankerConfig, serviceUrl?: string);
    rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    private processSingleBatch;
    private processMultipleBatches;
    isHealthy(): Promise<boolean>;
    getSupportedModels(): string[];
    /**
     * Get supported models from the remote service
     */
    getRemoteSupportedModels(): Promise<string[]>;
    /**
     * Set custom service URL
     */
    setServiceUrl(url: string): void;
    /**
     * Get current service URL
     */
    getServiceUrl(): string;
}
/**
 * Factory for creating HTTP reranker service with fallback
 */
export declare class HttpRerankerServiceWithFallback extends HttpRerankerService {
    private fallbackService?;
    constructor(config: RerankerConfig, serviceUrl?: string, fallbackService?: BaseRerankerService);
    rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    isHealthy(): Promise<boolean>;
    setFallbackService(service: BaseRerankerService): void;
}
