import { GuardrailDecision } from '../types/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';
export interface Logger {
    info(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
}
export interface GuardrailAuditEntry {
    /** Timestamp of the guardrail decision */
    ts: string;
    /** API route that triggered the guardrail */
    route: string;
    /** Tenant identifier */
    tenant: string;
    /** User identifier */
    userId: string;
    /** Original query */
    query: string;
    /** Guardrail decision result */
    decision: 'answerable' | 'not_answerable' | 'bypassed' | 'disabled';
    /** Confidence score */
    confidence: number;
    /** Applied threshold type */
    thresholdType: string;
    /** Reason code if not answerable */
    reasonCode?: string;
    /** Number of retrieval results analyzed */
    retrievalResultsCount: number;
    /** Score statistics summary */
    scoreStats: {
        mean: number;
        max: number;
        min: number;
        stdDev: number;
        count: number;
    };
    /** Performance metrics */
    performanceMetrics: {
        scoringDuration: number;
        totalDuration: number;
    };
    /** Request IP address */
    ip?: string;
    /** User agent */
    userAgent?: string;
    /** Additional context */
    context?: Record<string, any>;
}
/**
 * Specialized audit logger for guardrail decisions
 */
export declare class GuardrailAuditLogger {
    private logger;
    constructor(logger: Logger);
    /**
     * Log a guardrail decision
     */
    logGuardrailDecision(route: string, query: string, userContext: UserContext, decision: GuardrailDecision, ip?: string, userAgent?: string, additionalContext?: Record<string, any>): void;
    /**
     * Log guardrail performance metrics
     */
    logPerformanceMetrics(tenantId: string, metrics: {
        avgScoringDuration: number;
        avgTotalDuration: number;
        decisionsPerMinute: number;
        idkRate: number;
        falsePositiveRate?: number;
        falseNegativeRate?: number;
    }): void;
    /**
     * Log threshold configuration changes
     */
    logThresholdUpdate(tenantId: string, oldThreshold: any, newThreshold: any, updatedBy: string): void;
    /**
     * Log guardrail errors
     */
    logError(route: string, query: string, tenantId: string, errorMessage: string, ip?: string, userAgent?: string): void;
    private mapDecisionType;
}
/**
 * Create a guardrail audit logger instance
 */
export declare function createGuardrailAuditLogger(logger: Logger): GuardrailAuditLogger;
