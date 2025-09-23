import { KeywordSearchService } from './keyword-search.js';
import { RrfFusionService } from './rrf-fusion.js';
import { RerankerService } from './reranker.js';
import { VectorSearchResult, VectorSearchParams } from '../types/vector.js';
import {
  HybridSearchRequest,
  HybridSearchResult,
  TenantSearchConfig,
  SearchPerformanceMetrics,
  StructuredHybridSearchResult
} from '../types/hybrid.js';
import {
  RerankerRequest,
  RerankerDocument,
  RerankerResult, // Added import for RerankerResult
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
  ): Promise<StructuredHybridSearchResult>;

  // Legacy compatibility method
  searchLegacy(
    collectionName: string,
    request: HybridSearchRequest,
    userTenants: string[],
    userAcl: string[]
  ): Promise<StructuredHybridSearchResult>;

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
    this.initializeDefaultConfigs();
  }

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

  private getTimeoutConfig(tenantId?: string): TimeoutConfig {
    const config = this.timeoutConfigs.get(tenantId || 'default');
    return config || DEFAULT_TIMEOUTS;
  }

  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<StructuredHybridSearchResult> {
    const startTime = performance.now();

    if (!validateUserAuthorization(userContext)) {
      throw new Error('User authorization validation failed');
    }

    const tenantConfig = request.tenantId ?
      await this.getTenantConfig(request.tenantId) :
      this.getDefaultConfig();

    const keywordSearchEnabled = request.enableKeywordSearch ?? tenantConfig.keywordSearchEnabled;
    console.log(`🔄 Hybrid search mode: vector + ${keywordSearchEnabled ? 'keyword' : 'vector-only'}`);

    const rbacFilter = buildQdrantRBACFilter(userContext);

    if (request.filter && Object.keys(request.filter).length > 0) {
      this.addAdditionalFilters(rbacFilter, request.filter);
    }

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

    let vectorSearchResults: VectorSearchResult[] = [];
    let keywordSearchResults: HybridSearchResult[] = [];
    let fusedResults: HybridSearchResult[] = [];
    let rerankerActualResults: RerankerResult[] | undefined = undefined; // Actual raw reranker results

    try {
      const timeouts = this.getTimeoutConfig(request.tenantId);

      const vectorStartTime = performance.now();
      console.log('🔍 Hybrid search: Starting embedding generation...');
      console.log('Query:', request.query);

      const embeddingResult = await this.executeWithTimeout(
        () => this.embeddingService.embed(request.query),
        timeouts.embedding,
        'Embedding generation'
      );
      const queryVector = embeddingResult.result;
      console.log('✅ Embedding generated:', queryVector?.length, 'dimensions');

      console.log('🔍 Hybrid search: Starting vector search...');
      console.log('Collection:', collectionName);
      console.log('Limit:', request.limit);
      console.log('Filter:', JSON.stringify(rbacFilter, null, 2));

      const vectorSearchResult = await this.executeWithTimeout(
        () => this.vectorSearchService.search(collectionName, {
          queryVector,
          limit: request.limit,
          filter: rbacFilter
        }),
        timeouts.vectorSearch,
        'Vector search',
        () => Promise.resolve([])
      );

      vectorSearchResults = vectorSearchResult.result;
      console.log('✅ Vector search completed:', vectorSearchResults?.length, 'results');

      if (vectorSearchResults && vectorSearchResults.length > 0) {
        console.log('📋 Vector search results:');
        vectorSearchResults.forEach((result, i) => {
          console.log(`   ${i+1}. ID: ${result.id}, Score: ${result.score}`);
          console.log(`      Tenant: ${result.payload?.tenant || result.payload?.tenantId}`);
          console.log(`      ACL: ${JSON.stringify(result.payload?.acl)}`);
        });
      } else {
        console.log('❌ Vector search returned 0 results!');
      }

      metrics.vectorSearchDuration = performance.now() - vectorStartTime;
      metrics.vectorResultCount = vectorSearchResults.length;

      if (vectorSearchResult.timedOut) {
        console.warn('StructuredLog:VectorSearchTimeout', {
          timeoutMs: timeouts.vectorSearch,
          fallbackUsed: true,
          tenantId: request.tenantId
        });
      }

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
          () => Promise.resolve([])
        );

        keywordSearchResults = keywordSearchResult.result;
        metrics.keywordSearchDuration = performance.now() - keywordStartTime;
        metrics.keywordResultCount = keywordSearchResults.length;

        if (keywordSearchResult.timedOut) {
          console.warn('StructuredLog:KeywordSearchTimeout', {
            timeoutMs: timeouts.keywordSearch,
            fallbackUsed: true,
            tenantId: request.tenantId
          });
        }
      }

      const fusionStartTime = performance.now();
      const rrfConfig = {
        k: request.rrfK ?? tenantConfig.defaultRrfK,
        vectorWeight: request.vectorWeight ?? tenantConfig.defaultVectorWeight,
        keywordWeight: request.keywordWeight ?? tenantConfig.defaultKeywordWeight
      };

      fusedResults = this.rrfFusionService.fuseResults(
        vectorSearchResults,
        keywordSearchResults,
        rrfConfig
      );

      metrics.fusionDuration = performance.now() - fusionStartTime;
      metrics.finalResultCount = fusedResults.length;

      let finalResults = fusedResults; // This will hold the results after reranking if applied

      if (tenantConfig.rerankerEnabled && this.rerankerService) {
        const rerankerStartTime = performance.now();

        const rerankerOpResult = await this.executeWithTimeout(
          async () => {
            const topNIn = RERANKER_CONFIG.TOPN_IN;
            const resultsForReranking = fusedResults.slice(0, topNIn);

            const rerankerDocs: RerankerDocument[] = resultsForReranking.map(result => ({
              id: result.id,
              content: result.content || '',
              payload: result.payload,
              originalScore: result.fusionScore
            }));

            const rerankerRequest: RerankerRequest = {
              query: request.query,
              documents: rerankerDocs,
              topK: RERANKER_CONFIG.TOPN_OUT
            };

            rerankerActualResults = await this.rerankerService!.rerank(rerankerRequest); // Store raw reranker results

            return rerankerActualResults.map(rerankedResult => { // Use raw reranker results for mapping
              const originalResult = fusedResults.find(r => r.id === rerankedResult.id);
              return {
                ...originalResult!,
                score: rerankedResult.rerankerScore,
                fusionScore: rerankedResult.rerankerScore,
                vectorScore: originalResult?.vectorScore,
                keywordScore: originalResult?.keywordScore
              };
            });
          },
          timeouts.reranker,
          'Reranker',
          () => Promise.resolve(fusedResults)
        );

        finalResults = rerankerOpResult.result;
        metrics.rerankerDuration = performance.now() - rerankerStartTime;
        metrics.rerankingEnabled = !rerankerOpResult.timedOut;
        metrics.documentsReranked = rerankerOpResult.timedOut ? 0 : Math.min(fusedResults.length, RERANKER_CONFIG.TOPN_IN);

        if (rerankerOpResult.timedOut) {
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

      const filteredResults = finalResults
        .slice(0, request.limit)
        .filter(result => this.validateEnhancedRbacAccess(result, userContext))
        .map(result => this.applyLanguageRelevance(result, userContext));

      metrics.totalDuration = performance.now() - startTime;
      metrics.finalResultCount = filteredResults.length;

      return {
        finalResults: filteredResults,
        vectorSearchResults: vectorSearchResults,
        keywordSearchResults: keywordSearchResults,
        fusionResults: fusedResults,
        rerankerResults: rerankerActualResults, // Pass actual raw reranker results
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

  updateTenantTimeouts(tenantId: string, timeouts: TimeoutConfig): void {
    this.timeoutConfigs.set(tenantId, timeouts);
  }

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

  async searchLegacy(
    collectionName: string,
    request: HybridSearchRequest,
    userTenants: string[],
    userAcl: string[]
  ): Promise<StructuredHybridSearchResult> {
    const userContext: UserContext = {
      id: userAcl[0] || '',
      groupIds: userAcl.slice(1),
      tenantId: userTenants[0] || ''
    };

    return this.search(collectionName, request, userContext);
  }

  private addAdditionalFilters(rbacFilter: any, additionalFilter: Record<string, any>): void {
    if (additionalFilter.must && Array.isArray(additionalFilter.must)) {
      rbacFilter.must.push(...additionalFilter.must);
    }

    if (additionalFilter.should && Array.isArray(additionalFilter.should)) {
      if (!rbacFilter.should) {
        rbacFilter.should = [];
      }
      rbacFilter.should.push(...additionalFilter.should);
     }

    for (const [key, value] of Object.entries(additionalFilter)) {
      if (key !== 'must' && key !== 'should') {
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
  }

  private validateEnhancedRbacAccess(
    result: HybridSearchResult,
    userContext: UserContext
  ): boolean {
    const payload = result.payload;
    if (!payload) return false;

    const docMetadata = {
      tenantId: payload.tenantId || payload.tenant,
      docId: payload.docId || result.id,
      acl: Array.isArray(payload.acl) ? payload.acl : [payload.acl],
      lang: payload.lang
    };

    const hasAccess = hasDocumentAccess(userContext, docMetadata);
    if (!hasAccess) {
      console.log('🚫 RBAC Access Denied:', {
        resultId: result.id,
        userTenant: userContext.tenantId,
        userGroups: userContext.groupIds,
        docTenant: docMetadata.tenantId,
        docAcl: docMetadata.acl
      });
    }

    return hasAccess;
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

export class CachedHybridSearchService extends HybridSearchServiceImpl {
  private queryCache = new Map<string, {
    results: HybridSearchResult[];
    timestamp: number;
    ttl: number;
  }>();

  private readonly CACHE_TTL = 5 * 60 * 1000;

  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<StructuredHybridSearchResult> {
    const cacheKey = this.createCacheKey(collectionName, request, userContext);

    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return {
        finalResults: cached.results,
        vectorSearchResults: [],
        keywordSearchResults: [],
        fusionResults: cached.results,
        rerankerResults: undefined,
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

    const result = await super.search(collectionName, request, userContext);

    this.queryCache.set(cacheKey, {
      results: result.finalResults,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL
    });

    this.cleanupCache();

    return result;
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