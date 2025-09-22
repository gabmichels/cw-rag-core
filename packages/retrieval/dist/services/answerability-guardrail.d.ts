import { AnswerabilityScore, TenantGuardrailConfig, GuardrailDecision, IdkResponse } from '../types/guardrail.js';
import { HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { RerankerResult } from '../types/reranker.js';
import { UserContext } from '@cw-rag-core/shared';
export interface AnswerabilityGuardrailService {
    /**
     * Evaluate if a query is answerable based on retrieval results
     */
    evaluateAnswerability(query: string, results: HybridSearchResult[], userContext: UserContext, metrics?: SearchPerformanceMetrics): Promise<GuardrailDecision>;
    /**
     * Calculate answerability score from retrieval results
     */
    calculateAnswerabilityScore(results: HybridSearchResult[], rerankerResults?: RerankerResult[]): AnswerabilityScore;
    /**
     * Get tenant-specific guardrail configuration
     */
    getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    /**
     * Update tenant guardrail configuration
     */
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
    /**
     * Generate IDK response based on score and configuration
     */
    generateIdkResponse(score: AnswerabilityScore, config: TenantGuardrailConfig, results: HybridSearchResult[]): IdkResponse;
}
export declare class AnswerabilityGuardrailServiceImpl implements AnswerabilityGuardrailService {
    private tenantConfigs;
    constructor();
    evaluateAnswerability(query: string, results: HybridSearchResult[], userContext: UserContext, _metrics?: SearchPerformanceMetrics): Promise<GuardrailDecision>;
    calculateAnswerabilityScore(results: HybridSearchResult[], rerankerResults?: RerankerResult[]): AnswerabilityScore;
    getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
    generateIdkResponse(score: AnswerabilityScore, config: TenantGuardrailConfig, results: HybridSearchResult[]): IdkResponse;
    private calculateScoreStatistics;
    private calculateStatisticalScore;
    private calculateThresholdScore;
    private calculateMLFeaturesScore;
    private calculateRerankerConfidenceScore;
    private calculateVectorKeywordAlignment;
    private calculateEnsembleConfidence;
    private applyThresholdDecision;
    private selectIdkTemplate;
    private generateFallbackSuggestions;
    private createAuditTrail;
    private calculatePercentile;
    private createEmptyStats;
    private createPassthroughScore;
    private isAdminUser;
    private generateScoreReasoning;
    private initializeDefaultConfigs;
    private getDefaultConfig;
}
export declare function createAnswerabilityGuardrailService(): AnswerabilityGuardrailService;
export declare class CachedAnswerabilityGuardrailService extends AnswerabilityGuardrailServiceImpl {
    private configCache;
    private readonly CONFIG_CACHE_TTL;
    getTenantConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    updateTenantConfig(config: TenantGuardrailConfig): Promise<void>;
}
