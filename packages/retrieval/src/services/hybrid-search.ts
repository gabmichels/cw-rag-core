import { KeywordSearchService } from './keyword-search.js';
import { RrfFusionService } from './rrf-fusion.js';
import { fuse, FusionConfig, FusionStrategyName, FusionInput } from './fusion.js';
import { RerankerService } from './reranker.js';
import { extractQueryTerms } from '../nlp/keyphrase-extract.js';
import { loadCorpusStats } from '../stats/corpus-stats.js';
import { getAliasCluster } from '../sem/alias-cluster.js';
import { computeMatchFeatures, Candidate, CandidateFields } from '../rank/coverage-proximity.js';
import { exclusivityPenalty } from '../rank/exclusivity.js';
import { computeKeywordPoints, KeywordPointsConfig, CandidateSignals, TermWeight } from '../rank/keyword-points.js';
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
  // Domainless ranking telemetry data
  private domainlessQueryTerms: any = null;
  private domainlessGroups: any[] = [];

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

      if (fallback) {
        const isTimeout = (error as Error).message.includes('timeout');
        console.warn(`${operationName} ${isTimeout ? 'timed out' : 'failed'}, using fallback`);
        try {
          const fallbackResult = await fallback();
          return { result: fallbackResult, timedOut: isTimeout };
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

    // Check if domainless ranking is enabled for retrieval expansion
    const domainlessEnabled = process.env.FEATURES_ENABLED === 'on' || process.env.DOMAINLESS_RANKING_ENABLED === 'on';

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

      // Use expanded query for embedding if available (intentConfig is set later, so we need to check here)
      const preliminaryIntent = this.intentDetector.detectIntent(request.query);
      const preliminaryConfig = this.intentDetector.getIntentConfig(preliminaryIntent, request.query);
      const effectiveQuery = preliminaryConfig.expandedQuery || request.query;

      console.log('🔍 Hybrid search: Starting embedding generation...');
      console.log('Original query:', request.query);
      console.log('Effective query:', effectiveQuery);

      const embeddingResult = await this.executeWithTimeout(
        () => this.embeddingService.embed(effectiveQuery),
        timeouts.embedding,
        'Embedding generation'
      );
      const queryVector = embeddingResult.result;
      console.log('✅ Embedding generated:', queryVector?.length, 'dimensions');

      console.log('🔍 Hybrid search: Starting vector search...');
      console.log('Collection:', collectionName);
      console.log('Limit:', request.limit);
      console.log('Filter:', JSON.stringify(rbacFilter, null, 2));

      // Increase pre-fusion k for better diversity when adaptive weighting or domainless ranking enabled
      const baseRetrievalK = (queryAdaptiveEnabled || domainlessEnabled) ?
        Math.max(request.limit, parseInt(process.env.RETRIEVAL_K_BASE || '12')) :
        request.limit;

      let vectorSearchResult;
      try {
        vectorSearchResult = await this.executeWithTimeout(
          () => this.vectorSearchService.search(collectionName, {
            queryVector,
            limit: baseRetrievalK,
            filter: rbacFilter
          }),
          timeouts.vectorSearch,
          'Vector search'
        );

        vectorSearchResults = vectorSearchResult.result;
      } catch (error) {
        // If vector search fails completely, return empty results
        console.error('Vector search failed completely:', error);
        return {
          finalResults: [],
          vectorSearchResults: [],
          keywordSearchResults: [],
          fusionResults: [],
          rerankerResults: undefined,
          metrics: {
            ...metrics,
            vectorSearchDuration: performance.now() - vectorStartTime,
            vectorResultCount: 0,
            totalDuration: performance.now() - startTime,
            finalResultCount: 0
          }
        };
      }
      console.log('✅ Vector search completed:', vectorSearchResults?.length, 'results');

      // Debug: Check if target chunk is in vector results
      const targetId = '67001fb9-f2f7-adb3-712b-5df9dc00c772';
      const foundInVector = vectorSearchResults?.find(r => r.id === targetId);
      if (foundInVector) {
        console.log('🎯 TARGET CHUNK FOUND IN VECTOR RESULTS:', foundInVector.id, 'Score:', foundInVector.score);
      } else {
        console.log('❌ TARGET CHUNK NOT FOUND IN VECTOR RESULTS');
      }

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

        try {
          const keywordSearchResult = await this.executeWithTimeout(
            () => this.keywordSearchService.search(
              collectionName,
              request.query,
              request.limit,
              rbacFilter
            ),
            timeouts.keywordSearch,
            'Keyword search'
          );

          keywordSearchResults = keywordSearchResult.result;
          metrics.keywordSearchDuration = performance.now() - keywordStartTime;
          metrics.keywordResultCount = keywordSearchResults.length;

          // Debug: Check if target chunk is in keyword results
          const foundInKeyword = keywordSearchResults?.find(r => r.id === targetId);
          if (foundInKeyword) {
            console.log('🎯 TARGET CHUNK FOUND IN KEYWORD RESULTS:', foundInKeyword.id, 'Score:', foundInKeyword.score);
          } else {
            console.log('❌ TARGET CHUNK NOT FOUND IN KEYWORD RESULTS');
          }

          if (keywordSearchResult.timedOut) {
            console.warn('StructuredLog:KeywordSearchTimeout', {
              timeoutMs: timeouts.keywordSearch,
              fallbackUsed: true,
              tenantId: request.tenantId
            });
          }
        } catch (error) {
          // If keyword search is explicitly enabled but fails, log the error and proceed without keyword results.
          // This allows the vector search results to still be processed and returned.
          console.error('Keyword search failed when explicitly enabled:', error);
          keywordSearchResults = []; // Ensure keyword results are empty for subsequent fusion
          metrics.keywordSearchDuration = performance.now() - keywordStartTime;
          metrics.keywordResultCount = 0;
          // The function will continue execution to the fusion step, potentially with only vector results.
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
      let baseFusedResults = fusionResults.map(fusionResult => {
        // Find original result data
        const vectorResult = dedupedVectorResults.find(r => r.id === fusionResult.id);
        const keywordResult = dedupedKeywordResults.find(r => r.id === fusionResult.id);
        const sourceResult = vectorResult || keywordResult;

        if (!sourceResult) return null;

        return {
          id: fusionResult.id,
          score: fusionResult.fusedScore,
          vectorScore: fusionResult.components.vector || 0,
          keywordScore: keywordSearchEnabled ? (fusionResult.components.keyword || 0) : undefined,
          fusionScore: fusionResult.fusedScore,
          searchType: vectorResult && keywordResult ? 'hybrid' :
                      vectorResult ? 'vector_only' : 'keyword_only',
          payload: sourceResult.payload,
          content: this.extractContent(sourceResult)
        };
      }).filter(Boolean) as HybridSearchResult[];

      // Apply domainless ranking if enabled
      console.log('🔍 Domainless ranking enabled:', domainlessEnabled);
      if (domainlessEnabled) {
        console.log('🚀 Applying domainless ranking for query:', request.query);
        baseFusedResults = await this.applyDomainlessRanking(baseFusedResults, request.query, this.embeddingService, request.tenantId || 'default');
        console.log('✅ Domainless ranking applied, results count:', baseFusedResults.length);
      }

      // Check if keyword points ranking is enabled
      const keywordPointsEnabled = process.env.KW_POINTS_ENABLED === 'on';

      // Apply keyword points ranking if enabled
      console.log('🔍 Keyword points ranking enabled:', keywordPointsEnabled);
      let keywordPointsResults: any[] = [];
      if (keywordPointsEnabled) {
        console.log('🚀 Applying keyword points ranking for query:', request.query);
        const kwConfig = this.loadKeywordPointsConfig();
        const terms = this.extractTermWeights(request.query, request.tenantId || 'default');

        // Debug keyword points term extraction
        console.log('🎯 KEYWORD POINTS DEBUG - Extracted terms:', terms);
        console.log('🎯 KEYWORD POINTS DEBUG - Terms count:', terms.length);
        if (terms.length === 0) {
          console.log('❌ NO TERMS EXTRACTED FOR KEYWORD POINTS RANKING - This is the problem!');
        }

        const candidateSignals = this.buildCandidateSignals(baseFusedResults, keywordSearchResults, fusedResults);

        // Create wrapper for exclusivity penalty function
        const exclusivityWrapper = (candTerms: string[], topTerms: string[]) => {
          const groups = [topTerms]; // Convert to expected format
          return exclusivityPenalty(candTerms, groups, loadCorpusStats(request.tenantId || 'default'));
        };

        keywordPointsResults = computeKeywordPoints(terms, candidateSignals, kwConfig, exclusivityWrapper);

        // Update scores with keyword points
        baseFusedResults = baseFusedResults.map(result => {
          const kwResult = keywordPointsResults.find(kw => kw.id === result.id);
          if (kwResult) {
            return {
              ...result,
              score: kwResult.finalAfterKw,
              fusionScore: kwResult.finalAfterKw,
              keywordPoints: kwResult.breakdown
            };
          }
          return result;
        });

        // Record telemetry for keyword points ranking
        const { telemetry } = await import('../telemetry.js');
        const retrievalTrace: any = {
          queryId: `query-${Date.now()}`,
          tenantId: request.tenantId,
          query: request.query,
          terms: terms.map(t => ({ term: t.term, weight: t.weight, rank: t.rank })),
          candidates: keywordPointsResults.map(kw => ({
            id: kw.id,
            fusedScore: kw.finalAfterKw - kw.breakdown.lambda * kw.kwNorm, // Original fused score
            keywordPoints: {
              raw_kw: kw.rawKw,
              kw_norm: kw.kwNorm,
              lambda: kw.breakdown.lambda,
              final_after_kw: kw.finalAfterKw,
              perTerm: kw.breakdown.perTerm,
              proximity_bonus: kw.breakdown.proximity_bonus,
              coverage_bonus: kw.breakdown.coverage_bonus,
              exclusivity_multiplier: kw.breakdown.exclusivity_multiplier
            }
          })),
          kwStats: {
            median_raw_kw: keywordPointsResults.length > 0 ?
              keywordPointsResults.map(kw => kw.rawKw).sort((a, b) => a - b)[Math.floor(keywordPointsResults.length / 2)] : 0,
            min_norm: Math.min(...keywordPointsResults.map(kw => kw.kwNorm)),
            max_norm: Math.max(...keywordPointsResults.map(kw => kw.kwNorm))
          }
        };
        telemetry.recordRetrievalTrace(retrievalTrace);

        console.log('✅ Keyword points ranking applied, results count:', baseFusedResults.length);
      }

      fusedResults = baseFusedResults;

      // Debug: Check if target chunk survived fusion and ranking
      const foundInFused = fusedResults?.find(r => r.id === targetId);
      if (foundInFused) {
        console.log('🎯 TARGET CHUNK FOUND IN FINAL FUSED RESULTS:', foundInFused.id, 'Score:', foundInFused.score);
      } else {
        console.log('❌ TARGET CHUNK NOT FOUND IN FINAL FUSED RESULTS');
      }

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
              topK: adaptiveConfig.rerankerConfig?.topK || RERANKER_CONFIG.TOPN_OUT
            };

            rerankerActualResults = await this.rerankerService!.rerank(rerankerRequest); // Store raw reranker results

            return rerankerActualResults.map(rerankedResult => { // Use raw reranker results for mapping
              const originalResult = fusedResults.find(r => r.id === rerankedResult.id);
              return {
                ...originalResult!,
                score: rerankedResult.rerankerScore,
                fusionScore: rerankedResult.rerankerScore,
                vectorScore: originalResult?.vectorScore || 0, // Ensure it's a number
                keywordScore: originalResult?.keywordScore || 0 // Ensure it's a number
              };
            });
          },
          timeouts.reranker,
          'Reranker',
          async () => {
            // Fallback for any reranker error, not just timeout
            console.warn('Reranker failed, using fusion results as fallback');
            return fusedResults;
          }
        );

        finalResults = rerankerOpResult.result;
        metrics.rerankerDuration = performance.now() - rerankerStartTime;
        metrics.rerankingEnabled = rerankerActualResults !== undefined;
        metrics.documentsReranked = rerankerActualResults !== undefined ? Math.min(fusedResults.length, RERANKER_CONFIG.TOPN_IN) : 0;

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
        .map((result, index) => ({
          ...this.applyLanguageRelevance(result, userContext),
          rank: index + 1
        }));

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
          })),
          // Add domainless ranking telemetry if enabled
          domainlessEnabled,
          ...(domainlessEnabled && {
            queryTerms: this.domainlessQueryTerms,
            groups: this.domainlessGroups,
            domainlessResults: filteredResults.slice(0, 10).map(result => ({
              id: result.id,
              docId: result.payload?.docId,
              fused: result.fusionScore,
              coverage: (result as any).domainlessFeatures?.coverage,
              proximity: (result as any).domainlessFeatures?.proximity,
              fieldBoost: (result as any).domainlessFeatures?.fieldBoost,
              exclusivityPenalty: (result as any).domainlessFeatures?.exclusivityPenalty,
              final: result.score
            }))
          })
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
    // Ensure we always retrieve the actual 'default' config from the map
    // which may have been updated or initialized.
    return this.tenantConfigs.get('default') || {
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
    /**
     * Apply domainless ranking features to fusion results
     */
    private async applyDomainlessRanking(
      fusedResults: HybridSearchResult[],
      query: string,
      embeddingService: { embed(text: string): Promise<number[]> },
      tenantId: string
    ): Promise<HybridSearchResult[]> {
      try {
        console.log('📊 Loading corpus stats...');
        const stats = loadCorpusStats(tenantId);
        console.log('📊 Corpus stats loaded:', { totalDocs: stats.totalDocs, totalTokens: stats.totalTokens });

        console.log('🔍 Extracting query terms...');
        const qt = extractQueryTerms(query, stats);
        console.log('🔍 Query terms extracted:', qt);

        // Store for telemetry
        this.domainlessQueryTerms = qt;

        // Build groups from top phrases
        const topN = parseInt(process.env.KEYPHRASE_TOP_N || '3');
        console.log('🔗 Building alias clusters for top', topN, 'phrases...');
        const groups: string[][] = [];

        for (const phrase of qt.phrases.slice(0, topN)) {
          console.log('🔗 Getting cluster for phrase:', phrase);
          const cluster = await getAliasCluster(phrase, stats, embeddingService);
          console.log('🔗 Cluster for', phrase, ':', cluster);
          groups.push(cluster.members);
        }

        console.log('🔗 Final groups:', groups);

        // Store for telemetry
        this.domainlessGroups = groups;

        if (groups.length === 0) {
          return fusedResults; // No groups to rank with
        }

        // Apply ranking to each result
        const rankedResults = await Promise.all(
          fusedResults.map(async (result) => {
            const candidate: Candidate = {
              id: result.id,
              content: result.content,
              payload: result.payload
            };

            const fields: CandidateFields = {
              title: result.payload?.title,
              header: result.payload?.header,
              sectionPath: result.payload?.sectionPath
            };

            const features = computeMatchFeatures(candidate, groups, fields);
            const candidateTerms = candidate.content ? candidate.content.toLowerCase().split(/\s+/) : [];
            const pen = exclusivityPenalty(candidateTerms, groups, stats);

            // Debug logging for domainless ranking
            if (features.coverage > 0 || features.proximity > 0) {
              console.log(`🎯 CRITICAL ANSWER BOOST: Chunk ${candidate.id} contains direct answer to query "${query}"`);
              console.log(`   Coverage: ${features.coverage}, Proximity: ${features.proximity}, FieldBoost: ${features.fieldBoost}, Penalty: ${pen}`);
              console.log(`   Content preview: ${(candidate.content || '').substring(0, 200)}...`);
            }

            // Apply aggressive feature weights for domainless ranking
            const coverageAlpha = parseFloat(process.env.COVERAGE_ALPHA || '0.50');
            const proximityBeta = parseFloat(process.env.PROXIMITY_BETA || '0.30');
            const fieldBoostDelta = parseFloat(process.env.FIELD_BOOST_DELTA || '0.20');
            const exclusivityGamma = parseFloat(process.env.EXCLUSIVITY_GAMMA || '0.10');

            const fusedScore = result.fusionScore || result.score;
            const finalScore = fusedScore *
              (1 + coverageAlpha * features.coverage) *
              (1 + proximityBeta * features.proximity) *
              (1 + fieldBoostDelta * features.fieldBoost) *
              (1 - exclusivityGamma * pen);

            return {
              ...result,
              score: finalScore,
              fusionScore: finalScore,
              // Store features for telemetry
              domainlessFeatures: {
                coverage: features.coverage,
                proximity: features.proximity,
                fieldBoost: features.fieldBoost,
                exclusivityPenalty: pen,
                fusedScoreBefore: fusedScore,
                finalScoreAfter: finalScore
              }
            };
          })
        );

        // Sort by final score
        return rankedResults.sort((a, b) => (b.score || 0) - (a.score || 0));

      } catch (error) {
        console.warn('Domainless ranking failed, using original results:', error);
        return fusedResults;
      }
    }

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

    private loadKeywordPointsConfig(): KeywordPointsConfig {
      // Parse field weights from combined format: "body:3,title:2.2,header:1.8,section:1.3,docId:1.1"
      const fieldWeightsStr = process.env.KW_FIELD_WEIGHTS || 'body:3,title:2.2,header:1.8,section:1.3,docId:1.1';
      const fieldWeights: { [key: string]: number } = {};
      fieldWeightsStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':');
        if (key && value) {
          fieldWeights[key.trim()] = parseFloat(value.trim());
        }
      });

      return {
        fieldWeights: {
          body: fieldWeights.body || 3.0,
          title: fieldWeights.title || 2.2,
          header: fieldWeights.header || 1.8,
          sectionPath: fieldWeights.section || 1.3,
          docId: fieldWeights.docId || 1.1
        },
        idfGamma: parseFloat(process.env.KW_IDF_GAMMA || '0.35'),
        rankDecay: parseFloat(process.env.KW_RANK_DECAY || '0.85'),
        bodySatC: parseFloat(process.env.KW_BODY_SAT_C || '0.6'),
        earlyPosTokens: parseFloat(process.env.KW_EARLY_POS_TOKENS || '250'),
        earlyPosNudge: parseFloat(process.env.KW_EARLY_POS_NUDGE || '1.08'),
        proxWin: parseFloat(process.env.KW_PROX_WIN || '30'),
        proximityBeta: parseFloat(process.env.KW_PROXIMITY_BETA || '0.25'),
        coverageAlpha: parseFloat(process.env.KW_COVERAGE_ALPHA || '0.25'),
        exclusivityGamma: parseFloat(process.env.KW_EXCLUSIVITY_GAMMA || '0.25'),
        lambdaKw: parseFloat(process.env.KW_LAMBDA || '0.25'),
        clampKwNorm: parseFloat(process.env.KW_CLAMP_KW_NORM || '2.0'),
        topKCoverage: parseInt(process.env.KW_TOPK_COVERAGE || '2'),
        softAndStrict: process.env.KW_SOFTAND_STRICT === 'on',
        softAndOverridePct: parseFloat(process.env.KW_SOFTAND_OVERRIDE_PCTL || '95')
      };
    }

    private extractTermWeights(query: string, tenantId: string): TermWeight[] {
      // Use the same term extraction as keyword search for consistency
      const stopwords = new Set(['what', 'is', 'the', 'of', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);
      const rawTerms = query.toLowerCase().split(/\s+/);
      const simpleTerms = rawTerms
        .map(term => term.replace(/[^\w]/g, '')) // Remove punctuation
        .filter(term => term.length > 2 && !stopwords.has(term)); // Filter stopwords and short terms

      console.log('🎯 KEYWORD POINTS - Simple terms extracted:', simpleTerms);

      // Also try complex phrase extraction as fallback
      const qt = extractQueryTerms(query, loadCorpusStats(tenantId));
      console.log('🎯 KEYWORD POINTS - Complex phrases extracted:', qt.phrases);

      const terms: TermWeight[] = [];

      // Use simple terms if no phrases found, or combine both
      const termsToUse = qt.phrases.length > 0 ? qt.phrases : simpleTerms;
      console.log('🎯 KEYWORD POINTS - Final terms to use:', termsToUse);

      // Calculate weights for terms
      for (let i = 0; i < termsToUse.length; i++) {
        const term = termsToUse[i];
        const normalizedTerm = term.toLowerCase();
        const baseWeight = 1.0;
        const idfWeight = Math.pow(this.calculateIDF(normalizedTerm, qt), this.loadKeywordPointsConfig().idfGamma);
        const phraseBonus = termsToUse.length > 1 ? 1.25 : 1.0;
        const weight = baseWeight * idfWeight * phraseBonus;

        terms.push({
          term: normalizedTerm,
          weight,
          rank: i + 1
        });
      }

      console.log('🎯 KEYWORD POINTS - Final TermWeight array:', terms);
      return terms;
    }

    private calculateIDF(term: string, qt: any): number {
      // Simplified IDF calculation - could be enhanced
      const totalDocs = qt.totalDocs || 10000;
      const docFreq = Math.max(1, totalDocs * 0.1); // Assume 10% of docs contain common terms
      return Math.log(totalDocs / docFreq);
    }

    private buildCandidateSignals(fusedResults: HybridSearchResult[], keywordResults: HybridSearchResult[], originalFused: HybridSearchResult[]): CandidateSignals[] {
      return fusedResults.map(result => {
        // Find corresponding keyword result for term hits from keyword search results
        const keywordResult = keywordResults.find((r: any) => r.id === result.id && r.termHits);

        const signals: CandidateSignals = {
          id: result.id,
          docId: result.payload?.docId,
          sectionPath: result.payload?.sectionPath,
          title: result.payload?.title,
          header: result.payload?.header,
          body: result.content,
          tokenPositions: (keywordResult as any)?.tokenPositions || {},
          termHits: (keywordResult as any)?.termHits || {},
          fusedScore: result.fusionScore || result.score
        };

        // Debug for target chunk
        if (result.id === '67001fb9-f2f7-adb3-712b-5df9dc00c772') {
          console.log('🎯 TARGET CHUNK CANDIDATE SIGNALS:', JSON.stringify(signals, null, 2));
        }

        return signals;
      });
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