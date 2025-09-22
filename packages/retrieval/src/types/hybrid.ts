export interface KeywordSearchResult {
  id: string;
  score: number;
  payload?: Record<string, any>;
  content?: string;
}

export interface HybridSearchRequest {
  query: string;
  limit: number;
  vectorWeight?: number; // Weight for vector search results (0-1, default 0.7)
  keywordWeight?: number; // Weight for keyword search results (0-1, default 0.3)
  rrfK?: number; // RRF k parameter for rank fusion (default 60)
  enableKeywordSearch?: boolean; // Whether to enable keyword search
  filter?: Record<string, any>; // Metadata filter
  tenantId?: string; // For tenant-specific configuration
}

export interface HybridSearchResult {
  id: string;
  score: number;
  payload?: Record<string, any>;
  content?: string;
  vectorScore?: number; // Original vector search score
  keywordScore?: number; // Original keyword search score
  fusionScore: number; // Final RRF fusion score
  searchType: 'hybrid' | 'vector_only' | 'keyword_only';
  rank?: number; // Position in final ranked results (added by reranker)
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
  k: number; // RRF parameter k (typically 60)
  vectorWeight: number; // Weight for vector results
  keywordWeight: number; // Weight for keyword results
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