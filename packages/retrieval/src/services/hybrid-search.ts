import { KeywordSearchService } from './keyword-search.js';
import { RrfFusionService } from './rrf-fusion.js';
import { fuse, FusionConfig, FusionStrategyName, FusionInput } from './fusion.js';
import { RerankerService } from './reranker.js';
import { VectorSearchResult, VectorSearchParams } from '../types/vector.js';
import { createQueryIntentDetector, QueryIntentDetector } from '../retrieval/intent.js';
import { createNoveltyScorer } from '../context/novelty.js';
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
  private intentDetector: QueryIntentDetector;

  constructor(
    private vectorSearchService: VectorSearchService,
    private keywordSearchService: KeywordSearchService,
    private rrfFusionService: RrfFusionService,
    private embeddingService: { embed(text: string): Promise<number[]> },
    private rerankerService?: RerankerService
  ) {
    this.intentDetector = createQueryIntentDetector();
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

    // Apply query-adaptive weighting if enabled
    let adaptiveConfig = tenantConfig;
    let intentConfig: any = null;
    let fusionStrategy: FusionStrategyName = (process.env.FUSION_STRATEGY as FusionStrategyName) || "weighted_average";
    const queryAdaptiveEnabled = process.env.QUERY_ADAPTIVE_WEIGHTS === 'on';

    const keywordSearchEnabled = request.enableKeywordSearch ?? adaptiveConfig.keywordSearchEnabled;
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

      // Increase pre-fusion k for better diversity when adaptive weighting enabled
      const baseRetrievalK = queryAdaptiveEnabled ?
        Math.max(request.limit, intentConfig?.retrievalK || parseInt(process.env.RETRIEVAL_K_BASE || '12')) :
        request.limit;

      const vectorSearchResult = await this.executeWithTimeout(
        () => this.vectorSearchService.search(collectionName, {
          queryVector,
          limit: baseRetrievalK,
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

      // Apply query-adaptive weighting after vector search (for high-confidence shortcut)
      if (queryAdaptiveEnabled && !request.vectorWeight && !request.keywordWeight) {
        // Get top vector score for high-confidence shortcut
        const topVectorScore = vectorSearchResults.length > 0 ? vectorSearchResults[0].score : undefined;
        intentConfig = this.intentDetector.getConfigForQuery(request.query, topVectorScore);
        adaptiveConfig = {
          ...tenantConfig,
          defaultVectorWeight: intentConfig.vectorWeight,
          defaultKeywordWeight: intentConfig.keywordWeight
        };
        fusionStrategy = intentConfig.strategy;
        console.log(`🎯 Query intent detected, adaptive weights: vector=${intentConfig.vectorWeight}, keyword=${intentConfig.keywordWeight}, strategy=${fusionStrategy}, k=${intentConfig.retrievalK}`);
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

      // Deduplicate results before fusion
      const dedupedVectorResults = this.deduplicateResults(vectorSearchResults, request.query);
      const dedupedKeywordResults = this.deduplicateResults(keywordSearchResults, request.query);

      // Prepare fusion inputs
      const vectorInputs: FusionInput[] = dedupedVectorResults.map((result, index) => ({
        id: result.id,
        score: result.score || 0,
        rank: index + 1,
        docId: result.payload?.docId
      }));

      const keywordInputs: FusionInput[] = dedupedKeywordResults.map((result, index) => ({
        id: result.id,
        score: result.score || 0,
        rank: index + 1,
        docId: result.payload?.docId
      }));

      const fusionConfig: FusionConfig = {
        strategy: fusionStrategy,
        kParam: parseInt(process.env.FUSION_K_PARAM || '5'),
        vectorWeight: request.vectorWeight ?? adaptiveConfig.defaultVectorWeight,
        keywordWeight: request.keywordWeight ?? adaptiveConfig.defaultKeywordWeight,
        normalization: (process.env.FUSION_NORMALIZATION as "zscore" | "minmax" | "none") || "minmax"
      };

      const fusionResults = fuse(vectorInputs, keywordInputs, fusionConfig);

      // Convert fusion results back to HybridSearchResult format
      fusedResults = fusionResults.map(fusionResult => {
        // Find original result data
        const vectorResult = dedupedVectorResults.find(r => r.id === fusionResult.id);
        const keywordResult = dedupedKeywordResults.find(r => r.id === fusionResult.id);
        const sourceResult = vectorResult || keywordResult;

        if (!sourceResult) return null;

        return {
          id: fusionResult.id,
          score: fusionResult.fusedScore,
          vectorScore: fusionResult.components.vector,
          keywordScore: fusionResult.components.keyword,
          fusionScore: fusionResult.fusedScore,
          searchType: vectorResult && keywordResult ? 'hybrid' :
                     vectorResult ? 'vector_only' : 'keyword_only',
          payload: sourceResult.payload,
          content: this.extractContent(sourceResult)
        };
      }).filter(Boolean) as HybridSearchResult[];

      metrics.fusionDuration = performance.now() - fusionStartTime;
      metrics.finalResultCount = fusedResults.length;

      let finalResults = fusedResults; // This will hold the results after reranking if applied

      // Apply MMR or reranking
      const mmrEnabled = process.env.MMR_ENABLED === 'on';
      if (mmrEnabled && this.embeddingService) {
        const mmrStartTime = performance.now();
        const noveltyScorer = createNoveltyScorer(undefined, this.embeddingService);
        finalResults = await noveltyScorer.applyMMR(fusedResults, request.limit * 2); // Expand for MMR
        metrics.rerankerDuration = performance.now() - mmrStartTime;
        metrics.rerankingEnabled = true;
        metrics.documentsReranked = finalResults.length;
        console.log('StructuredLog:MMRApplied', {
          inputCount: fusedResults.length,
          outputCount: finalResults.length,
          mmrDuration: metrics.rerankerDuration
        });
      } else if (adaptiveConfig.rerankerEnabled && this.rerankerService) {
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

      // Add fusion trace if debug tracing is enabled
      const fusionTraceEnabled = process.env.FUSION_DEBUG_TRACE === 'on';
      let fusionTrace: any = undefined;

      if (fusionTraceEnabled) {
        fusionTrace = {
          strategy: fusionStrategy,
          normalization: fusionConfig.normalization,
          vectorWeight: fusionConfig.vectorWeight,
          keywordWeight: fusionConfig.keywordWeight,
          kParam: fusionConfig.kParam,
          vectorTop: vectorInputs.slice(0, 10).map(input => ({
            id: input.id,
            score: input.score,
            rank: input.rank
          })),
          keywordTop: keywordInputs.slice(0, 10).map(input => ({
            id: input.id,
            score: input.score,
            rank: input.rank
          })),
          fused: fusionResults.slice(0, 10).map(result => ({
            id: result.id,
            fusedScore: result.fusedScore,
            components: result.components
          }))
        };
      }

      return {
        finalResults: filteredResults,
        vectorSearchResults: vectorSearchResults,
        keywordSearchResults: keywordSearchResults,
        fusionResults: fusedResults,
        rerankerResults: rerankerActualResults, // Pass actual raw reranker results
        metrics,
        fusionTrace
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

  private extractContent(result: VectorSearchResult | HybridSearchResult): string | undefined {
    // For HybridSearchResult (which keyword results now are), content is directly available
    if (this.isHybridSearchResult(result) && result.content) {
      return result.content;
    }

    // For VectorSearchResult, content is in payload
    if (this.isVectorSearchResult(result) && result.payload?.content) {
      return result.payload.content;
    }

    return undefined;
  }

  private isHybridSearchResult(result: any): result is HybridSearchResult {
    return 'content' in result && typeof result.content === 'string';
  }

  private isVectorSearchResult(result: any): result is VectorSearchResult {
    return 'vector' in result && Array.isArray(result.vector);
  }

  /**
     * Deduplicate results by docId, keeping the top 3 highest scoring chunks per document
     */
    private deduplicateResults<T extends { id: string; score?: number; payload?: any }>(results: T[], query?: string): T[] {
      const seen = new Map<string, T[]>();

      // Check if this is a temporal query that needs special handling
      const isTemporalQuery = query && /\b(how long|how many|how much|how tall|how wide|how deep|day|hour|minute|second|time|duration|length)\b/i.test(query);

      for (const result of results) {
        const docId = result.payload?.docId || result.id;
        const existing = seen.get(docId) || [];

        existing.push(result);

        // For temporal queries, boost chunks containing temporal keywords
        if (isTemporalQuery && result.payload?.content) {
          const content = result.payload.content.toLowerCase();
          if (/\b(day|hour|minute|second|time|duration|length|calendar|era|cycle)\b/.test(content)) {
            // Boost score for temporal content
            (result as any).temporalBoost = true;
            (result as any).score = (result.score || 0) + 0.2; // Add 0.2 boost
          }
        }

        // Sort by score descending and keep top 3 (or more for temporal queries)
        existing.sort((a, b) => (b.score || 0) - (a.score || 0));
        const maxChunks = isTemporalQuery ? 5 : 3; // Keep more chunks for temporal queries
        if (existing.length > maxChunks) {
          existing.splice(maxChunks);
        }

        seen.set(docId, existing);
      }

      return Array.from(seen.values()).flat();
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