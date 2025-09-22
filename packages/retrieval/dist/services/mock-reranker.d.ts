import { BaseRerankerService } from './reranker.js';
import { RerankerRequest, RerankerResult, RerankerConfig } from '../types/reranker.js';
/**
 * Mock reranker service for testing and development
 * Provides deterministic reranking behavior for consistent test results
 */
export declare class MockRerankerService extends BaseRerankerService {
    private delayMs;
    private failureRate;
    private mockScores;
    constructor(config: RerankerConfig, options?: {
        delayMs?: number;
        failureRate?: number;
        mockScores?: Map<string, number>;
    });
    rerank(request: RerankerRequest): Promise<RerankerResult[]>;
    private calculateMockScore;
    private hashString;
    isHealthy(): Promise<boolean>;
    getSupportedModels(): string[];
    setMockScore(docId: string, score: number): void;
    setMockScores(scores: Record<string, number>): void;
    clearMockScores(): void;
    setFailureRate(rate: number): void;
    setDelay(delayMs: number): void;
}
/**
 * Create a mock reranker service with preset configurations for different test scenarios
 */
export declare class MockRerankerServiceFactory {
    static createFast(config: RerankerConfig): MockRerankerService;
    static createSlow(config: RerankerConfig): MockRerankerService;
    static createUnreliable(config: RerankerConfig): MockRerankerService;
    static createWithPredefinedScores(config: RerankerConfig, scores: Record<string, number>): MockRerankerService;
    static createPerfectReranker(config: RerankerConfig): MockRerankerService;
}
