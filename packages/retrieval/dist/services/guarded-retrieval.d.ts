import { HybridSearchService } from './hybrid-search.js';
import { HybridSearchRequest, HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { AnswerabilityGuardrailService } from './answerability-guardrail.js';
import { Logger } from './guardrail-audit.js';
import { GuardrailDecision, IdkResponse, TenantGuardrailConfig } from '../types/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';
export interface GuardedRetrievalResult {
    /** Whether the query is answerable */
    isAnswerable: boolean;
    /** Retrieval results (if answerable) */
    results?: HybridSearchResult[];
    /** IDK response (if not answerable) */
    idkResponse?: IdkResponse;
    /** Guardrail decision details */
    guardrailDecision: GuardrailDecision;
    /** Search performance metrics */
    metrics: SearchPerformanceMetrics & {
        guardrailDuration: number;
    };
}
export interface GuardedRetrievalService {
    /**
     * Perform retrieval with guardrail evaluation
     */
    retrieveWithGuardrail(collectionName: string, request: HybridSearchRequest, userContext: UserContext, route?: string): Promise<GuardedRetrievalResult>;
    /**
     * Get tenant guardrail configuration
     */
    getTenantGuardrailConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    /**
     * Update tenant guardrail configuration
     */
    updateTenantGuardrailConfig(config: TenantGuardrailConfig): Promise<void>;
}
export declare class GuardedRetrievalServiceImpl implements GuardedRetrievalService {
    private hybridSearchService;
    private guardrailService;
    private auditLogger?;
    constructor(hybridSearchService: HybridSearchService, guardrailService?: AnswerabilityGuardrailService, logger?: Logger);
    retrieveWithGuardrail(collectionName: string, request: HybridSearchRequest, userContext: UserContext, route?: string): Promise<GuardedRetrievalResult>;
    getTenantGuardrailConfig(tenantId: string): Promise<TenantGuardrailConfig>;
    updateTenantGuardrailConfig(config: TenantGuardrailConfig): Promise<void>;
}
/**
 * Enhanced service with performance monitoring and caching
 */
export declare class PerformanceOptimizedGuardedRetrievalService extends GuardedRetrievalServiceImpl {
    private performanceMetrics;
    private readonly METRICS_WINDOW;
    retrieveWithGuardrail(collectionName: string, request: HybridSearchRequest, userContext: UserContext, route?: string): Promise<GuardedRetrievalResult>;
    /**
     * Get performance metrics for a tenant
     */
    getPerformanceMetrics(tenantId: string): {
        avgDuration: number;
        callCount: number;
        idkRate: number;
    } | null;
    private updatePerformanceMetrics;
}
/**
 * Factory function for creating guarded retrieval service
 */
export declare function createGuardedRetrievalService(hybridSearchService: HybridSearchService, logger?: Logger, performanceOptimized?: boolean): GuardedRetrievalService;
