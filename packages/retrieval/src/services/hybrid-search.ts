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
  RerankerDocument
} from '../types/reranker.js';
import {
  UserContext,
  buildQdrantRBACFilter,
  validateUserAuthorization,
  hasDocumentAccess,
  calculateLanguageRelevance
} from '@cw-rag-core/shared';

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
      // Perform vector search
      const vectorStartTime = performance.now();
      const queryVector = await this.embeddingService.embed(request.query);
      vectorResults = await this.vectorSearchService.search(collectionName, {
        queryVector,
        limit: request.limit,
        filter: rbacFilter
      });
      metrics.vectorSearchDuration = performance.now() - vectorStartTime;
      metrics.vectorResultCount = vectorResults.length;

      // Perform keyword search if enabled
      if (keywordSearchEnabled) {
        const keywordStartTime = performance.now();
        keywordResults = await this.keywordSearchService.search(
          collectionName,
          request.query,
          request.limit,
          rbacFilter
        );
        metrics.keywordSearchDuration = performance.now() - keywordStartTime;
        metrics.keywordResultCount = keywordResults.length;
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

      // Apply reranking if enabled
      let finalResults = fusedResults;
      if (tenantConfig.rerankerEnabled && this.rerankerService) {
        const rerankerStartTime = performance.now();

        try {
          // Take top 20 for reranking (or all if less than 20)
          const resultsForReranking = fusedResults.slice(0, 20);

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
            topK: 8 // Return top 8 after reranking
          };

          const rerankedResults = await this.rerankerService.rerank(rerankerRequest);

          // Convert reranked results back to HybridSearchResult format
          finalResults = rerankedResults.map(rerankedResult => {
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

          metrics.rerankerDuration = performance.now() - rerankerStartTime;
          metrics.rerankingEnabled = true;
          metrics.documentsReranked = rerankerDocs.length;

        } catch (error) {
          console.warn('StructuredLog:RerankerFailed', {
            error: (error as Error).message,
            fallbackToFusion: true
          });
          metrics.rerankerDuration = performance.now() - rerankerStartTime;
          metrics.rerankingEnabled = false;
          // Continue with fusion results
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
      rerankerEnabled: false
    };

    this.tenantConfigs.set('default', defaultConfig);
  }

  private getDefaultConfig(): TenantSearchConfig {
    return {
      tenantId: 'default',
      keywordSearchEnabled: true,
      defaultVectorWeight: 0.7,
      defaultKeywordWeight: 0.3,
      defaultRrfK: 60,
      rerankerEnabled: false
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