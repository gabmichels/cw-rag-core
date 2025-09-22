import { RERANKER_CONFIG } from '../types/reranker.js';
import { buildQdrantRBACFilter, validateUserAuthorization, hasDocumentAccess, calculateLanguageRelevance } from '@cw-rag-core/shared';
export class HybridSearchServiceImpl {
    vectorSearchService;
    keywordSearchService;
    rrfFusionService;
    embeddingService;
    rerankerService;
    tenantConfigs = new Map();
    constructor(vectorSearchService, keywordSearchService, rrfFusionService, embeddingService, rerankerService) {
        this.vectorSearchService = vectorSearchService;
        this.keywordSearchService = keywordSearchService;
        this.rrfFusionService = rrfFusionService;
        this.embeddingService = embeddingService;
        this.rerankerService = rerankerService;
        // Set default configurations
        this.initializeDefaultConfigs();
    }
    async search(collectionName, request, userContext) {
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
        const metrics = {
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
        let vectorResults = [];
        let keywordResults = [];
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
                keywordResults = await this.keywordSearchService.search(collectionName, request.query, request.limit, rbacFilter);
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
            const fusedResults = this.rrfFusionService.fuseResults(vectorResults, keywordResults, rrfConfig);
            metrics.fusionDuration = performance.now() - fusionStartTime;
            metrics.finalResultCount = fusedResults.length;
            // Apply reranking if enabled
            let finalResults = fusedResults;
            if (tenantConfig.rerankerEnabled && this.rerankerService) {
                const rerankerStartTime = performance.now();
                try {
                    // Take top RERANKER_TOPN_IN for reranking (default 20)
                    const topNIn = RERANKER_CONFIG.TOPN_IN;
                    const resultsForReranking = fusedResults.slice(0, topNIn);
                    // Convert to reranker documents
                    const rerankerDocs = resultsForReranking.map(result => ({
                        id: result.id,
                        content: result.content || '',
                        payload: result.payload,
                        originalScore: result.fusionScore
                    }));
                    const rerankerRequest = {
                        query: request.query,
                        documents: rerankerDocs,
                        topK: RERANKER_CONFIG.TOPN_OUT // Default 8
                    };
                    const rerankedResults = await this.rerankerService.rerank(rerankerRequest);
                    // Convert reranked results back to HybridSearchResult format
                    finalResults = rerankedResults.map(rerankedResult => {
                        const originalResult = fusedResults.find(r => r.id === rerankedResult.id);
                        return {
                            ...originalResult,
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
                    console.log('StructuredLog:RerankerSuccess', {
                        inputCount: rerankerDocs.length,
                        outputCount: rerankedResults.length,
                        rerankerDuration: metrics.rerankerDuration,
                        topNIn,
                        topNOut: RERANKER_CONFIG.TOPN_OUT
                    });
                }
                catch (error) {
                    console.warn('StructuredLog:RerankerFailed', {
                        error: error.message,
                        fallbackToFusion: true,
                        timeout: RERANKER_CONFIG.TIMEOUT_MS
                    });
                    metrics.rerankerDuration = performance.now() - rerankerStartTime;
                    metrics.rerankingEnabled = false;
                    // Continue with fusion results (fail open)
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
        }
        catch (error) {
            console.error('Hybrid search failed:', error);
            throw new Error(`Hybrid search failed: ${error.message}`);
        }
    }
    async getTenantConfig(tenantId) {
        const config = this.tenantConfigs.get(tenantId);
        if (!config) {
            return this.getDefaultConfig();
        }
        return config;
    }
    async updateTenantConfig(config) {
        this.tenantConfigs.set(config.tenantId, config);
    }
    initializeDefaultConfigs() {
        // Initialize with some default tenant configurations
        const defaultConfig = {
            tenantId: 'default',
            keywordSearchEnabled: true,
            defaultVectorWeight: 0.7,
            defaultKeywordWeight: 0.3,
            defaultRrfK: 60,
            rerankerEnabled: RERANKER_CONFIG.ENABLED
        };
        this.tenantConfigs.set('default', defaultConfig);
    }
    getDefaultConfig() {
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
    async searchLegacy(collectionName, request, userTenants, userAcl) {
        // Convert legacy parameters to UserContext
        const userContext = {
            id: userAcl[0] || '',
            groupIds: userAcl.slice(1),
            tenantId: userTenants[0] || ''
        };
        return this.search(collectionName, request, userContext);
    }
    addAdditionalFilters(rbacFilter, additionalFilter) {
        for (const [key, value] of Object.entries(additionalFilter)) {
            if (Array.isArray(value)) {
                rbacFilter.must.push({
                    key,
                    match: { any: value }
                });
            }
            else {
                rbacFilter.must.push({
                    key,
                    match: { value }
                });
            }
        }
    }
    validateEnhancedRbacAccess(result, userContext) {
        const payload = result.payload;
        if (!payload)
            return false;
        // Create document metadata for RBAC validation
        const docMetadata = {
            tenantId: payload.tenant,
            docId: payload.docId || result.id,
            acl: Array.isArray(payload.acl) ? payload.acl : [payload.acl],
            lang: payload.lang
        };
        return hasDocumentAccess(userContext, docMetadata);
    }
    applyLanguageRelevance(result, userContext) {
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
export function createHybridSearchService(vectorSearchService, keywordSearchService, rrfFusionService, embeddingService, rerankerService) {
    return new HybridSearchServiceImpl(vectorSearchService, keywordSearchService, rrfFusionService, embeddingService, rerankerService);
}
// Performance-optimized hybrid search with caching
export class CachedHybridSearchService extends HybridSearchServiceImpl {
    queryCache = new Map();
    CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    async search(collectionName, request, userContext) {
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
    async searchLegacy(collectionName, request, userTenants, userAcl) {
        const userContext = {
            id: userAcl[0] || '',
            groupIds: userAcl.slice(1),
            tenantId: userTenants[0] || ''
        };
        return this.search(collectionName, request, userContext);
    }
    createCacheKey(collectionName, request, userContext) {
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
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.queryCache.entries()) {
            if (now - value.timestamp > value.ttl) {
                this.queryCache.delete(key);
            }
        }
    }
}
