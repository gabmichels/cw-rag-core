import { createAnswerabilityGuardrailService } from './answerability-guardrail.js';
import { createGuardrailAuditLogger } from './guardrail-audit.js';
export class GuardedRetrievalServiceImpl {
    hybridSearchService;
    guardrailService;
    auditLogger;
    constructor(hybridSearchService, guardrailService, logger) {
        this.hybridSearchService = hybridSearchService;
        this.guardrailService = guardrailService || createAnswerabilityGuardrailService();
        this.auditLogger = logger ? createGuardrailAuditLogger(logger) : undefined;
    }
    async retrieveWithGuardrail(collectionName, request, userContext, route = '/ask') {
        const startTime = performance.now();
        try {
            // Perform hybrid search
            const searchResult = await this.hybridSearchService.search(collectionName, request, userContext);
            // Evaluate answerability
            const guardrailStartTime = performance.now();
            const guardrailDecision = await this.guardrailService.evaluateAnswerability(request.query, searchResult.results, userContext, searchResult.metrics);
            const guardrailDuration = performance.now() - guardrailStartTime;
            // Log guardrail decision
            if (this.auditLogger) {
                this.auditLogger.logGuardrailDecision(route, request.query, userContext, guardrailDecision);
            }
            const result = {
                isAnswerable: guardrailDecision.isAnswerable,
                results: guardrailDecision.isAnswerable ? searchResult.results : undefined,
                idkResponse: guardrailDecision.idkResponse,
                guardrailDecision,
                metrics: {
                    ...searchResult.metrics,
                    guardrailDuration
                }
            };
            return result;
        }
        catch (error) {
            // Log error
            if (this.auditLogger) {
                this.auditLogger.logError(route, request.query, userContext.tenantId || 'default', error.message);
            }
            throw new Error(`Guarded retrieval failed: ${error.message}`);
        }
    }
    async getTenantGuardrailConfig(tenantId) {
        return this.guardrailService.getTenantConfig(tenantId);
    }
    async updateTenantGuardrailConfig(config) {
        return this.guardrailService.updateTenantConfig(config);
    }
}
/**
 * Enhanced service with performance monitoring and caching
 */
export class PerformanceOptimizedGuardedRetrievalService extends GuardedRetrievalServiceImpl {
    performanceMetrics = new Map();
    METRICS_WINDOW = 60 * 1000; // 1 minute
    async retrieveWithGuardrail(collectionName, request, userContext, route = '/ask') {
        const startTime = performance.now();
        // Get result from parent implementation
        const result = await super.retrieveWithGuardrail(collectionName, request, userContext, route);
        // Update performance metrics
        this.updatePerformanceMetrics(userContext.tenantId || 'default', performance.now() - startTime, !result.isAnswerable);
        return result;
    }
    /**
     * Get performance metrics for a tenant
     */
    getPerformanceMetrics(tenantId) {
        const metrics = this.performanceMetrics.get(tenantId);
        if (!metrics || Date.now() - metrics.lastUpdated > this.METRICS_WINDOW) {
            return null;
        }
        return {
            avgDuration: metrics.avgDuration,
            callCount: metrics.callCount,
            idkRate: metrics.idkRate
        };
    }
    updatePerformanceMetrics(tenantId, duration, wasIdk) {
        const existing = this.performanceMetrics.get(tenantId);
        if (!existing || Date.now() - existing.lastUpdated > this.METRICS_WINDOW) {
            // Reset metrics for new window
            this.performanceMetrics.set(tenantId, {
                avgDuration: duration,
                callCount: 1,
                idkRate: wasIdk ? 1 : 0,
                lastUpdated: Date.now()
            });
        }
        else {
            // Update existing metrics
            const newCallCount = existing.callCount + 1;
            const newAvgDuration = (existing.avgDuration * existing.callCount + duration) / newCallCount;
            const newIdkCount = (existing.idkRate * existing.callCount) + (wasIdk ? 1 : 0);
            const newIdkRate = newIdkCount / newCallCount;
            this.performanceMetrics.set(tenantId, {
                avgDuration: newAvgDuration,
                callCount: newCallCount,
                idkRate: newIdkRate,
                lastUpdated: Date.now()
            });
        }
    }
}
/**
 * Factory function for creating guarded retrieval service
 */
export function createGuardedRetrievalService(hybridSearchService, logger, performanceOptimized = false) {
    const guardrailService = createAnswerabilityGuardrailService();
    return performanceOptimized ?
        new PerformanceOptimizedGuardedRetrievalService(hybridSearchService, guardrailService, logger) :
        new GuardedRetrievalServiceImpl(hybridSearchService, guardrailService, logger);
}
