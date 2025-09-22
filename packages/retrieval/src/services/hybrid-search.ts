import { KeywordSearchService } from './keyword-search.js';
import { RrfFusionService } from './rrf-fusion.js';
import { RerankerService } from './reranker.js';
import { VectorSearchResult, VectorSearchParams } from '../types/vector.js';
import {
  HybridSearchRequest,
  HybridSearchResult,
  TenantSearchConfig,
  SearchPerformanceMetrics
} from '../types/hybrid.js';
import {
  RerankerRequest,
  RerankerDocument,
  RERANKER_CONFIG
} from '../types/reranker.js';
import {
  UserContext,
  buildQdrantRBACFilter,
  validateUserAuthorization,
  hasDocumentAccess,
  calculateLanguageRelevance
} from '@cw-rag-core/shared';

// Timeout configuration interfaces
export interface TimeoutConfig {
  vectorSearch: number;
  keywordSearch: number;
  reranker: number;
  embedding: number;
  overall: number;
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  vectorSearch: parseInt(process.env.VECTOR_SEARCH_TIMEOUT_MS || '5000'),
  keywordSearch: parseInt(process.env.KEYWORD_SEARCH_TIMEOUT_MS || '3000'),
  reranker: parseInt(process.env.RERANKER_TIMEOUT_MS || '10000'),
  embedding: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '5000'),
  overall: parseInt(process.env.OVERALL_TIMEOUT_MS || '45000')
};

export interface VectorSearchService {
  search(
    collectionName: string,
    params: VectorSearchParams
  ): Promise<VectorSearchResult[]>;
}

export interface HybridSearchService {
  search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }>;

  // Legacy compatibility method
  searchLegacy(
    collectionName: string,
    request: HybridSearchRequest,
    userTenants: string[],
    userAcl: string[]
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }>;

  getTenantConfig(tenantId: string): Promise<TenantSearchConfig>;
  updateTenantConfig(config: TenantSearchConfig): Promise<void>;
}

export class HybridSearchServiceImpl implements HybridSearchService {
  private tenantConfigs = new Map<string, TenantSearchConfig>();
  private timeoutConfigs = new Map<string, TimeoutConfig>();

  constructor(
    private vectorSearchService: VectorSearchService,
    private keywordSearchService: KeywordSearchService,
    private rrfFusionService: RrfFusionService,
    private embeddingService: { embed(text: string): Promise<number[]> },
    private rerankerService?: RerankerService
  ) {
    // Set default configurations
    this.initializeDefaultConfigs();
  }

  /**
   * Execute operation with timeout and optional fallback
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
    fallback?: () => Promise<T>
  ): Promise<{ result: T; timedOut: boolean }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
          });
        })
      ]);

      clearTimeout(timeoutId);
      return { result, timedOut: false };
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).message.includes('timeout') && fallback) {
        console.warn(`${operationName} timed out, using fallback`);
        try {
          const fallbackResult = await fallback();
          return { result: fallbackResult, timedOut: true };
        } catch (fallbackError) {
          throw new Error(`${operationName} failed and fallback failed: ${(fallbackError as Error).message}`);
        }
      }

      throw error;
    }
  }

  /**
   * Get timeout configuration for tenant
   */
  private getTimeoutConfig(tenantId?: string): TimeoutConfig {
    const config = this.timeoutConfigs.get(tenantId || 'default');
    return config || DEFAULT_TIMEOUTS;
  }

  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }> {
    const startTime = performance.now();

    // Validate user authorization first
    if (!validateUserAuthorization(userContext)) {
      throw new Error('User authorization validation failed');
    }

    // Get tenant configuration
    const tenantConfig = request.tenantId ?
      await this.getTenantConfig(request.tenantId) :
      this.getDefaultConfig();

    // Determine if keyword search should be enabled
    const keywordSearchEnabled = request.enableKeywordSearch ?? tenantConfig.keywordSearchEnabled;

    // Build enhanced RBAC filter
    const rbacFilter = buildQdrantRBACFilter(userContext);

    // Add additional filters if provided
    if (request.filter && Object.keys(request.filter).length > 0) {
      this.addAdditionalFilters(rbacFilter, request.filter);
    }

    // Initialize metrics
    const metrics: SearchPerformanceMetrics = {
      vectorSearchDuration: 0,
      keywordSearchDuration: 0,
      fusionDuration: 0,
      rerankerDuration: 0,
      totalDuration: 0,
      vectorResultCount: 0,
      keywordResultCount: 0,
      finalResultCount: 0,
      rerankingEnabled: false,
      documentsReranked: 0
    };

    let vectorResults: VectorSearchResult[] = [];
    let keywordResults: any[] = [];

    try {
      const timeouts = this.getTimeoutConfig(request.tenantId);

      // Perform vector search with timeout
      const vectorStartTime = performance.now();
      const embeddingResult = await this.executeWithTimeout(
        () => this.embeddingService.embed(request.query),
        timeouts.embedding,
        'Embedding generation'
      );
      const queryVector = embeddingResult.result;

      const vectorSearchResult = await this.executeWithTimeout(
        () => this.vectorSearchService.search(collectionName, {
          queryVector,
          limit: request.limit,
          filter: rbacFilter
        }),
        timeouts.vectorSearch,
        'Vector search',
        // Fallback: return empty results if vector search fails
        () => Promise.resolve([])
      );

      vectorResults = vectorSearchResult.result;
      metrics.vectorSearchDuration = performance.now() - vectorStartTime;
      metrics.vectorResultCount = vectorResults.length;

      if (vectorSearchResult.timedOut) {
        console.warn('StructuredLog:VectorSearchTimeout', {
          timeoutMs: timeouts.vectorSearch,
          fallbackUsed: true,
          tenantId: request.tenantId
        });
      }

      // Perform keyword search if enabled with timeout
      if (keywordSearchEnabled) {
        const keywordStartTime = performance.now();
        const keywordSearchResult = await this.executeWithTimeout(
          () => this.keywordSearchService.search(
            collectionName,
            request.query,
            request.limit,
            rbacFilter
          ),
          timeouts.keywordSearch,
          'Keyword search',
          // Fallback: return empty results if keyword search fails
          () => Promise.resolve([])
        );

        keywordResults = keywordSearchResult.result;
        metrics.keywordSearchDuration = performance.now() - keywordStartTime;
        metrics.keywordResultCount = keywordResults.length;

        if (keywordSearchResult.timedOut) {
          console.warn('StructuredLog:KeywordSearchTimeout', {
            timeoutMs: timeouts.keywordSearch,
            fallbackUsed: true,
            tenantId: request.tenantId
          });
        }
      }

      // Perform RRF fusion
      const fusionStartTime = performance.now();
      const rrfConfig = {
        k: request.rrfK ?? tenantConfig.defaultRrfK,
        vectorWeight: request.vectorWeight ?? tenantConfig.defaultVectorWeight,
        keywordWeight: request.keywordWeight ?? tenantConfig.defaultKeywordWeight
      };

      const fusedResults = this.rrfFusionService.fuseResults(
        vectorResults,
        keywordResults,
        rrfConfig
      );

      metrics.fusionDuration = performance.now() - fusionStartTime;
      metrics.finalResultCount = fusedResults.length;

      // Apply reranking if enabled with timeout and fallback
      let finalResults = fusedResults;
      if (tenantConfig.rerankerEnabled && this.rerankerService) {
        const rerankerStartTime = performance.now();

        const rerankerResult = await this.executeWithTimeout(
          async () => {
            // Take top RERANKER_TOPN_IN for reranking (default 20)
            const topNIn = RERANKER_CONFIG.TOPN_IN;
            const resultsForReranking = fusedResults.slice(0, topNIn);

            // Convert to reranker documents
            const rerankerDocs: RerankerDocument[] = resultsForReranking.map(result => ({
              id: result.id,
              content: result.content || '',
              payload: result.payload,
              originalScore: result.fusionScore
            }));

            const rerankerRequest: RerankerRequest = {
              query: request.query,
              documents: rerankerDocs,
              topK: RERANKER_CONFIG.TOPN_OUT // Default 8
            };

            const rerankedResults = await this.rerankerService!.rerank(rerankerRequest);

            // Convert reranked results back to HybridSearchResult format
            return rerankedResults.map(rerankedResult => {
              const originalResult = fusedResults.find(r => r.id === rerankedResult.id);
              return {
                ...originalResult!,
                score: rerankedResult.rerankerScore,
                fusionScore: rerankedResult.rerankerScore,
                // Preserve original scores for debugging
                vectorScore: originalResult?.vectorScore,
                keywordScore: originalResult?.keywordScore
              };
            });
          },
          timeouts.reranker,
          'Reranker',
          // Fallback: return fusion results if reranking fails
          () => Promise.resolve(fusedResults)
        );

        finalResults = rerankerResult.result;
        metrics.rerankerDuration = performance.now() - rerankerStartTime;
        metrics.rerankingEnabled = !rerankerResult.timedOut;
        metrics.documentsReranked = rerankerResult.timedOut ? 0 : Math.min(fusedResults.length, RERANKER_CONFIG.TOPN_IN);

        if (rerankerResult.timedOut) {
          console.warn('StructuredLog:RerankerTimeout', {
            timeoutMs: timeouts.reranker,
            fallbackUsed: true,
            fusionResultsUsed: fusedResults.length,
            tenantId: request.tenantId
          });
        } else {
          console.log('StructuredLog:RerankerSuccess', {
            inputCount: Math.min(fusedResults.length, RERANKER_CONFIG.TOPN_IN),
            outputCount: finalResults.length,
            rerankerDuration: metrics.rerankerDuration,
            topNIn: RERANKER_CONFIG.TOPN_IN,
            topNOut: RERANKER_CONFIG.TOPN_OUT
          });
        }
      }

      // Apply final limit and enhanced RBAC post-filtering with language relevance
      const filteredResults = finalResults
        .slice(0, request.limit)
        .filter(result => this.validateEnhancedRbacAccess(result, userContext))
        .map(result => this.applyLanguageRelevance(result, userContext));

      metrics.totalDuration = performance.now() - startTime;
      metrics.finalResultCount = filteredResults.length;

      return {
        results: filteredResults,
        metrics
      };

    } catch (error) {
      console.error('Hybrid search failed:', error);
      throw new Error(`Hybrid search failed: ${(error as Error).message}`);
    }
  }

  async getTenantConfig(tenantId: string): Promise<TenantSearchConfig> {
    const config = this.tenantConfigs.get(tenantId);
    if (!config) {
      return this.getDefaultConfig();
    }
    return config;
  }

  async updateTenantConfig(config: TenantSearchConfig): Promise<void> {
    this.tenantConfigs.set(config.tenantId, config);
  }

  private initializeDefaultConfigs(): void {
    // Initialize with some default tenant configurations
    const defaultConfig: TenantSearchConfig = {
      tenantId: 'default',
      keywordSearchEnabled: true,
      defaultVectorWeight: 0.7,
      defaultKeywordWeight: 0.3,
      defaultRrfK: 60,
      rerankerEnabled: RERANKER_CONFIG.ENABLED
    };

    this.tenantConfigs.set('default', defaultConfig);
    this.timeoutConfigs.set('default', DEFAULT_TIMEOUTS);
  }

  /**
   * Update timeout configuration for a tenant
   */
  updateTenantTimeouts(tenantId: string, timeouts: TimeoutConfig): void {
    this.timeoutConfigs.set(tenantId, timeouts);
  }

  /**
   * Get timeout configuration for a tenant
   */
  getTenantTimeouts(tenantId: string): TimeoutConfig {
    return this.timeoutConfigs.get(tenantId) || DEFAULT_TIMEOUTS;
  }

  private getDefaultConfig(): TenantSearchConfig {
    return {
      tenantId: 'default',
      keywordSearchEnabled: true,
      defaultVectorWeight: 0.7,
      defaultKeywordWeight: 0.3,
      defaultRrfK: 60,
      rerankerEnabled: RERANKER_CONFIG.ENABLED
    };
  }

  // Legacy compatibility method
  async searchLegacy(
    collectionName: string,
    request: HybridSearchRequest,
    userTenants: string[],
    userAcl: string[]
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }> {
    // Convert legacy parameters to UserContext
    const userContext: UserContext = {
      id: userAcl[0] || '',
      groupIds: userAcl.slice(1),
      tenantId: userTenants[0] || ''
    };

    return this.search(collectionName, request, userContext);
  }

  private addAdditionalFilters(rbacFilter: any, additionalFilter: Record<string, any>): void {
    for (const [key, value] of Object.entries(additionalFilter)) {
      if (Array.isArray(value)) {
        rbacFilter.must.push({
          key,
          match: { any: value }
        });
      } else {
        rbacFilter.must.push({
          key,
          match: { value }
        });
      }
    }
  }

  private validateEnhancedRbacAccess(
    result: HybridSearchResult,
    userContext: UserContext
  ): boolean {
    const payload = result.payload;
    if (!payload) return false;

    // Create document metadata for RBAC validation
    const docMetadata = {
      tenantId: payload.tenant,
      docId: payload.docId || result.id,
      acl: Array.isArray(payload.acl) ? payload.acl : [payload.acl],
      lang: payload.lang
    };

    return hasDocumentAccess(userContext, docMetadata);
  }

  private applyLanguageRelevance(
    result: HybridSearchResult,
    userContext: UserContext
  ): HybridSearchResult {
    if (userContext.language && result.payload?.lang) {
      const languageScore = calculateLanguageRelevance(userContext.language, result.payload.lang);

      return {
        ...result,
        score: result.score ? result.score * languageScore : languageScore,
        fusionScore: result.fusionScore ? result.fusionScore * languageScore : languageScore
      };
    }
    return result;
  }
}

// Factory function for creating hybrid search service
export function createHybridSearchService(
  vectorSearchService: VectorSearchService,
  keywordSearchService: KeywordSearchService,
  rrfFusionService: RrfFusionService,
  embeddingService: { embed(text: string): Promise<number[]> },
  rerankerService?: RerankerService
): HybridSearchService {
  return new HybridSearchServiceImpl(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    embeddingService,
    rerankerService
  );
}

// Performance-optimized hybrid search with caching
export class CachedHybridSearchService extends HybridSearchServiceImpl {
  private queryCache = new Map<string, {
    results: HybridSearchResult[];
    timestamp: number;
    ttl: number;
  }>();

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }> {
    // Create cache key
    const cacheKey = this.createCacheKey(collectionName, request, userContext);

    // Check cache
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return {
        results: cached.results,
        metrics: {
          vectorSearchDuration: 0,
          keywordSearchDuration: 0,
          fusionDuration: 0,
          rerankerDuration: 0,
          totalDuration: 0,
          vectorResultCount: cached.results.length,
          keywordResultCount: 0,
          finalResultCount: cached.results.length,
          rerankingEnabled: false,
          documentsReranked: 0
        }
      };
    }

    // Perform search
    const result = await super.search(collectionName, request, userContext);

    // Cache result
    this.queryCache.set(cacheKey, {
      results: result.results,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    });

    // Clean up old cache entries
    this.cleanupCache();

    return result;
  }

  // Legacy compatibility method
  async searchLegacy(
    collectionName: string,
    request: HybridSearchRequest,
    userTenants: string[],
    userAcl: string[]
  ): Promise<{
    results: HybridSearchResult[];
    metrics: SearchPerformanceMetrics;
  }> {
    const userContext: UserContext = {
      id: userAcl[0] || '',
      groupIds: userAcl.slice(1),
      tenantId: userTenants[0] || ''
    };

    return this.search(collectionName, request, userContext);
  }

  private createCacheKey(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): string {
    return JSON.stringify({
      collection: collectionName,
      query: request.query,
      limit: request.limit,
      tenantId: userContext.tenantId,
      userId: userContext.id,
      groupIds: userContext.groupIds.sort(),
      language: userContext.language,
      vectorWeight: request.vectorWeight,
      keywordWeight: request.keywordWeight,
      rrfK: request.rrfK,
      enableKeyword: request.enableKeywordSearch,
      filter: request.filter
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.queryCache.delete(key);
      }
    }
  }
}