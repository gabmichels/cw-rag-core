export interface KeywordSearchResult {
    id: string;
    score: number;
    payload?: Record<string, any>;
    content?: string;
}
export interface HybridSearchRequest {
    query: string;
    limit: number;
    vectorWeight?: number;
    keywordWeight?: number;
    rrfK?: number;
    enableKeywordSearch?: boolean;
    filter?: Record<string, any>;
    tenantId?: string;
}
export interface HybridSearchResult {
    id: string;
    score: number;
    payload?: Record<string, any>;
    content?: string;
    vectorScore?: number;
    keywordScore?: number;
    fusionScore: number;
    searchType: 'hybrid' | 'vector_only' | 'keyword_only';
    rank?: number;
}
export interface TenantSearchConfig {
    tenantId: string;
    keywordSearchEnabled: boolean;
    defaultVectorWeight: number;
    defaultKeywordWeight: number;
    defaultRrfK: number;
    rerankerEnabled: boolean;
    rerankerConfig?: {
        model: string;
        topK: number;
        scoreThreshold: number;
    };
}
export interface RrfConfig {
    k: number;
    vectorWeight: number;
    keywordWeight: number;
}
export interface SearchPerformanceMetrics {
    vectorSearchDuration: number;
    keywordSearchDuration: number;
    fusionDuration: number;
    rerankerDuration?: number;
    totalDuration: number;
    vectorResultCount: number;
    keywordResultCount: number;
    finalResultCount: number;
    rerankingEnabled?: boolean;
    documentsReranked?: number;
}
