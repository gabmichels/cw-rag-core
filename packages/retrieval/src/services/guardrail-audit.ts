import { GuardrailDecision } from '../types/guardrail.js';
import { UserContext } from '@cw-rag-core/shared';

// Generic logger interface to avoid Fastify dependency
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
export class GuardrailAuditLogger {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Log a guardrail decision
   */
  logGuardrailDecision(
    route: string,
    query: string,
    userContext: UserContext,
    decision: GuardrailDecision,
    ip?: string,
    userAgent?: string,
    additionalContext?: Record<string, any>
  ): void {
    const entry: GuardrailAuditEntry = {
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
    this.logger.info(
      `Guardrail decision: ${entry.decision} for query in tenant ${entry.tenant}`,
      {
        audit: true,
        guardrail: true,
        ...entry
      }
    );
  }

  /**
   * Log guardrail performance metrics
   */
  logPerformanceMetrics(
    tenantId: string,
    metrics: {
      avgScoringDuration: number;
      avgTotalDuration: number;
      decisionsPerMinute: number;
      idkRate: number;
      falsePositiveRate?: number;
      falseNegativeRate?: number;
    }
  ): void {
    this.logger.info(
      `Guardrail performance metrics for tenant ${tenantId}`,
      {
        audit: true,
        guardrail: true,
        performance: true,
        tenantId,
        ...metrics
      }
    );
  }

  /**
   * Log threshold configuration changes
   */
  logThresholdUpdate(
    tenantId: string,
    oldThreshold: any,
    newThreshold: any,
    updatedBy: string
  ): void {
    this.logger.info(
      `Guardrail threshold updated for tenant ${tenantId}`,
      {
        audit: true,
        guardrail: true,
        config: true,
        tenantId,
        oldThreshold,
        newThreshold,
        updatedBy,
        ts: new Date().toISOString()
      }
    );
  }

  /**
   * Log guardrail errors
   */
  logError(
    route: string,
    query: string,
    tenantId: string,
    errorMessage: string,
    ip?: string,
    userAgent?: string
  ): void {
    this.logger.error(
      `Guardrail error in tenant ${tenantId}`,
      {
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
      }
    );
  }

  private mapDecisionType(decision: GuardrailDecision): GuardrailAuditEntry['decision'] {
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
export function createGuardrailAuditLogger(logger: Logger): GuardrailAuditLogger {
  return new GuardrailAuditLogger(logger);
}