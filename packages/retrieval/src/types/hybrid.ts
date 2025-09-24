import { VectorSearchResult } from './vector.js';
import { RerankerResult } from './reranker.js';

export interface HybridSearchRequest {
  query: string;
  limit: number;
  vectorWeight?: number;
  keywordWeight?: number;
  rrfK?: number;
  enableKeywordSearch?: boolean;
  filter?: Record<string, any>;
  tenantId?: string; // Optional tenant ID for overriding user context
}

export interface HybridSearchResult {
  id: string;
  score: number; // Final score after fusion/reranking
  content?: string;
  payload?: Record<string, any>;
  searchType?: 'vector_only' | 'keyword_only' | 'hybrid' | 'section_reconstructed' | 'section_related';
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number; // Score specifically from RRF fusion
  rerankerScore?: number; // Score specifically from reranker
  rank?: number; // Rank in the final sorted results
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

export interface SearchPerformanceMetrics {
  totalDuration: number;
  vectorSearchDuration: number;
  keywordSearchDuration: number;
  fusionDuration: number;
  rerankerDuration: number;
  embeddingDuration?: number; // Time for embedding generation
  vectorResultCount: number;
  keywordResultCount: number;
  finalResultCount: number; // After fusion and reranking
  rerankingEnabled: boolean;
  documentsReranked: number;
}

export interface StructuredHybridSearchResult {
  finalResults: HybridSearchResult[];
  vectorSearchResults: VectorSearchResult[];
  keywordSearchResults: HybridSearchResult[]; // Keyword results as HybridSearchResult[] for consistency
  fusionResults: HybridSearchResult[];
  rerankerResults?: RerankerResult[];
  metrics: SearchPerformanceMetrics;
}