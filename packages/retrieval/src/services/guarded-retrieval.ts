import { HybridSearchService } from './hybrid-search.js';
import {
  HybridSearchRequest,
  HybridSearchResult,
  SearchPerformanceMetrics,
} from '../types/hybrid.js';
import { SectionAwareSearchResult, SectionAwareHybridSearchService } from './section-aware-hybrid-search.js'; // Correct import
import {
  AnswerabilityGuardrailService,
  createAnswerabilityGuardrailService
} from './answerability-guardrail.js';
import {
  GuardrailAuditLogger,
  createGuardrailAuditLogger,
  Logger
} from './guardrail-audit.js';
import {
  GuardrailDecision,
  IdkResponse,
  TenantGuardrailConfig
} from '../types/guardrail.js';
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
  // Add section-aware metrics directly to GuardedRetrievalResult
  sectionCompletionMetrics?: SectionAwareSearchResult['sectionCompletionMetrics'];
  reconstructedSections?: SectionAwareSearchResult['reconstructedSections'];
}

export interface GuardedRetrievalService {
  /**
   * Perform retrieval with guardrail evaluation
   */
  retrieveWithGuardrail(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext,
    route?: string
  ): Promise<GuardedRetrievalResult>;

  /**
   * Get tenant guardrail configuration
   */
  getTenantGuardrailConfig(tenantId: string): Promise<TenantGuardrailConfig>;

  /**
   * Update tenant guardrail configuration
   */
  updateTenantGuardrailConfig(config: TenantGuardrailConfig): Promise<void>;
}

export class GuardedRetrievalServiceImpl implements GuardedRetrievalService {
  private guardrailService: AnswerabilityGuardrailService;
  private auditLogger?: GuardrailAuditLogger;

  constructor(
    private hybridSearchService: HybridSearchService,
    guardrailService?: AnswerabilityGuardrailService,
    logger?: Logger
  ) {
    this.guardrailService = guardrailService || createAnswerabilityGuardrailService();
    this.auditLogger = logger ? createGuardrailAuditLogger(logger) : undefined;
  }

  async retrieveWithGuardrail(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext,
    route: string = '/ask'
  ): Promise<GuardedRetrievalResult> {
    try {
      // Perform hybrid search
      const searchResult = await (this.hybridSearchService as SectionAwareHybridSearchService).search( // Cast to SectionAwareHybridSearchService
        collectionName,
        request,
        userContext
      );

      // Evaluate answerability with structured results
      const guardrailStartTime = performance.now();
      const guardrailDecision = await this.guardrailService.evaluateAnswerability(
        request.query,
        {
          vectorResults: searchResult.vectorSearchResults,
          keywordResults: searchResult.keywordSearchResults,
          fusionResults: searchResult.fusionResults,
          rerankerResults: searchResult.rerankerResults,
        }, // Pass the structured results directly
        userContext,
        searchResult.metrics
      );
      const guardrailDuration = performance.now() - guardrailStartTime;

      // Log guardrail decision
      if (this.auditLogger) {
        this.auditLogger.logGuardrailDecision(
          route,
          request.query,
          userContext,
          guardrailDecision
        );
      }

      const result: GuardedRetrievalResult = {
        isAnswerable: guardrailDecision.isAnswerable,
        // The `results` field in GuardedRetrievalResult should now map to finalResults
        results: guardrailDecision.isAnswerable ? searchResult.finalResults : undefined,
        idkResponse: guardrailDecision.idkResponse,
        guardrailDecision,
        metrics: {
          ...searchResult.metrics,
          guardrailDuration
        },
        sectionCompletionMetrics: searchResult.sectionCompletionMetrics, // Propagate section completion metrics
        reconstructedSections: searchResult.reconstructedSections // Propagate reconstructed sections
      };

      return result;

    } catch (error) {
      // Log error
      if (this.auditLogger) {
        this.auditLogger.logError(
          route,
          request.query,
          userContext.tenantId || 'default',
          (error as Error).message
        );
      }

      throw new Error(`Guarded retrieval failed: ${(error as Error).message}`);
    }
  }

  async getTenantGuardrailConfig(tenantId: string): Promise<TenantGuardrailConfig> {
    return this.guardrailService.getTenantConfig(tenantId);
  }

  async updateTenantGuardrailConfig(config: TenantGuardrailConfig): Promise<void> {
    return this.guardrailService.updateTenantConfig(config);
  }
}

/**
 * Enhanced service with performance monitoring and caching
 */
export class PerformanceOptimizedGuardedRetrievalService extends GuardedRetrievalServiceImpl {
  private performanceMetrics = new Map<string, {
    avgDuration: number;
    callCount: number;
    idkRate: number;
    lastUpdated: number;
  }>();

  private readonly METRICS_WINDOW = 60 * 1000; // 1 minute

  async retrieveWithGuardrail(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext,
    route: string = '/ask'
  ): Promise<GuardedRetrievalResult> {
    const startTime = performance.now();

    // Get result from parent implementation
    const result = await super.retrieveWithGuardrail(collectionName, request, userContext, route);

    // Update performance metrics
    this.updatePerformanceMetrics(
      userContext.tenantId || 'default',
      performance.now() - startTime,
      !result.isAnswerable
    );

    return result;
  }

  /**
   * Get performance metrics for a tenant
   */
  getPerformanceMetrics(tenantId: string): {
    avgDuration: number;
    callCount: number;
    idkRate: number;
  } | null {
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

  private updatePerformanceMetrics(tenantId: string, duration: number, wasIdk: boolean): void {
    const existing = this.performanceMetrics.get(tenantId);

    if (!existing || Date.now() - existing.lastUpdated > this.METRICS_WINDOW) {
      // Reset metrics for new window
      this.performanceMetrics.set(tenantId, {
        avgDuration: duration,
        callCount: 1,
        idkRate: wasIdk ? 1 : 0,
        lastUpdated: Date.now()
      });
    } else {
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
export function createGuardedRetrievalService(
  hybridSearchService: HybridSearchService,
  logger?: Logger,
  performanceOptimized: boolean = false
): GuardedRetrievalService {
  const guardrailService = createAnswerabilityGuardrailService();

  return performanceOptimized ?
    new PerformanceOptimizedGuardedRetrievalService(hybridSearchService, guardrailService, logger) :
    new GuardedRetrievalServiceImpl(hybridSearchService, guardrailService, logger);
}