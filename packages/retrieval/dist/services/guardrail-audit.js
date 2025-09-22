/**
 * Specialized audit logger for guardrail decisions
 */
export class GuardrailAuditLogger {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Log a guardrail decision
     */
    logGuardrailDecision(route, query, userContext, decision, ip, userAgent, additionalContext) {
        const entry = {
            ts: new Date().toISOString(),
            route,
            tenant: userContext.tenantId || 'default',
            userId: userContext.id,
            query,
            decision: this.mapDecisionType(decision),
            confidence: decision.score.confidence,
            thresholdType: decision.threshold.type,
            reasonCode: decision.idkResponse?.reasonCode,
            retrievalResultsCount: decision.score.scoreStats.count,
            scoreStats: {
                mean: decision.score.scoreStats.mean,
                max: decision.score.scoreStats.max,
                min: decision.score.scoreStats.min,
                stdDev: decision.score.scoreStats.stdDev,
                count: decision.score.scoreStats.count
            },
            performanceMetrics: decision.auditTrail.performanceMetrics,
            ip,
            userAgent,
            context: additionalContext
        };
        // Use structured logging for guardrail decisions
        this.logger.info(`Guardrail decision: ${entry.decision} for query in tenant ${entry.tenant}`, {
            audit: true,
            guardrail: true,
            ...entry
        });
    }
    /**
     * Log guardrail performance metrics
     */
    logPerformanceMetrics(tenantId, metrics) {
        this.logger.info(`Guardrail performance metrics for tenant ${tenantId}`, {
            audit: true,
            guardrail: true,
            performance: true,
            tenantId,
            ...metrics
        });
    }
    /**
     * Log threshold configuration changes
     */
    logThresholdUpdate(tenantId, oldThreshold, newThreshold, updatedBy) {
        this.logger.info(`Guardrail threshold updated for tenant ${tenantId}`, {
            audit: true,
            guardrail: true,
            config: true,
            tenantId,
            oldThreshold,
            newThreshold,
            updatedBy,
            ts: new Date().toISOString()
        });
    }
    /**
     * Log guardrail errors
     */
    logError(route, query, tenantId, errorMessage, ip, userAgent) {
        this.logger.error(`Guardrail error in tenant ${tenantId}`, {
            audit: true,
            guardrail: true,
            error: true,
            route,
            query,
            tenantId,
            errorMessage,
            ip,
            userAgent,
            ts: new Date().toISOString()
        });
    }
    mapDecisionType(decision) {
        if (decision.auditTrail.decisionRationale === 'GUARDRAIL_DISABLED') {
            return 'disabled';
        }
        if (decision.auditTrail.decisionRationale === 'BYPASS_ENABLED') {
            return 'bypassed';
        }
        return decision.isAnswerable ? 'answerable' : 'not_answerable';
    }
}
/**
 * Create a guardrail audit logger instance
 */
export function createGuardrailAuditLogger(logger) {
    return new GuardrailAuditLogger(logger);
}
