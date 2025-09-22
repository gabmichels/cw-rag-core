import { KeywordSearchService } from './keyword-search.js';
import { RrfFusionService } from './rrf-fusion.js';
import { RerankerService } from './reranker.js';
import { VectorSearchResult, VectorSearchParams } from '../types/vector.js';
import { HybridSearchRequest, HybridSearchResult, TenantSearchConfig, SearchPerformanceMetrics } from '../types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';
export interface VectorSearchService {
    search(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]>;
}
export interface HybridSearchService {
    search(collectionName: string, request: HybridSearchRequest, userContext: UserContext): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    searchLegacy(collectionName: string, request: HybridSearchRequest, userTenants: string[], userAcl: string[]): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    getTenantConfig(tenantId: string): Promise<TenantSearchConfig>;
    updateTenantConfig(config: TenantSearchConfig): Promise<void>;
}
export declare class HybridSearchServiceImpl implements HybridSearchService {
    private vectorSearchService;
    private keywordSearchService;
    private rrfFusionService;
    private embeddingService;
    private rerankerService?;
    private tenantConfigs;
    constructor(vectorSearchService: VectorSearchService, keywordSearchService: KeywordSearchService, rrfFusionService: RrfFusionService, embeddingService: {
        embed(text: string): Promise<number[]>;
    }, rerankerService?: RerankerService | undefined);
    search(collectionName: string, request: HybridSearchRequest, userContext: UserContext): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    getTenantConfig(tenantId: string): Promise<TenantSearchConfig>;
    updateTenantConfig(config: TenantSearchConfig): Promise<void>;
    private initializeDefaultConfigs;
    private getDefaultConfig;
    searchLegacy(collectionName: string, request: HybridSearchRequest, userTenants: string[], userAcl: string[]): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    private addAdditionalFilters;
    private validateEnhancedRbacAccess;
    private applyLanguageRelevance;
}
export declare function createHybridSearchService(vectorSearchService: VectorSearchService, keywordSearchService: KeywordSearchService, rrfFusionService: RrfFusionService, embeddingService: {
    embed(text: string): Promise<number[]>;
}, rerankerService?: RerankerService): HybridSearchService;
export declare class CachedHybridSearchService extends HybridSearchServiceImpl {
    private queryCache;
    private readonly CACHE_TTL;
    search(collectionName: string, request: HybridSearchRequest, userContext: UserContext): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    searchLegacy(collectionName: string, request: HybridSearchRequest, userTenants: string[], userAcl: string[]): Promise<{
        results: HybridSearchResult[];
        metrics: SearchPerformanceMetrics;
    }>;
    private createCacheKey;
    private cleanupCache;
}
