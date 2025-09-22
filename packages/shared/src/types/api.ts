import { Document } from './document.js';
import { UserContext } from './user.js';
import { FreshnessInfo, FreshnessStats } from '../utils/freshness.js';

// Ingest API types
export interface IngestDocumentRequest {
  documents: Omit<Document, 'id'>[];
}

export interface IngestDocumentResponse {
  success: boolean;
  documentIds: string[];
  failedDocuments?: { document: Omit<Document, 'id'>; error: string }[];
}

// Retrieval types
export interface RetrievalRequest {
  query: string;
  limit?: number;
  filter?: Record<string, any>;
}

// Ask API types with Phase 2 pipeline support
export interface AskRequest {
  query: string;
  userContext: UserContext;
  k?: number; // Number of documents to retrieve
  filter?: Record<string, any>; // Metadata filter for RAG

  // Hybrid search configuration
  hybridSearch?: {
    vectorWeight?: number; // Weight for vector search results (0-1, default 0.7)
    keywordWeight?: number; // Weight for keyword search results (0-1, default 0.3)
    rrfK?: number; // RRF k parameter for rank fusion (default 60)
    enableKeywordSearch?: boolean; // Whether to enable keyword search
  };

  // Reranker configuration
  reranker?: {
    enabled?: boolean; // Whether to use reranking
    model?: string; // Reranker model to use
    topK?: number; // Number of results to rerank
  };

  // Answer synthesis options
  synthesis?: {
    maxContextLength?: number; // Maximum context length for synthesis
    includeCitations?: boolean; // Whether to include citations
    answerFormat?: 'markdown' | 'plain'; // Answer format
  };

  // Performance and debugging options
  includeMetrics?: boolean; // Whether to include performance metrics
  includeDebugInfo?: boolean; // Whether to include debug information
}

export interface RetrievedDocument {
  document: Document;
  score: number;
  freshness?: FreshnessInfo;

  // Enhanced retrieval metadata
  searchType?: 'hybrid' | 'vector_only' | 'keyword_only';
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  rerankerScore?: number;
  rank?: number;
}

export interface AskResponse {
  answer: string;
  retrievedDocuments: RetrievedDocument[];
  queryId: string;

  // Guardrail decision with enhanced metadata
  guardrailDecision?: {
    isAnswerable: boolean;
    confidence: number;
    reasonCode?: string;
    suggestions?: string[];
    scoreStats?: {
      mean: number;
      max: number;
      min: number;
      stdDev: number;
      count: number;
    };
    algorithmScores?: {
      statistical: number;
      threshold: number;
      mlFeatures: number;
      rerankerConfidence?: number;
    };
  };

  // Enhanced citation and freshness information
  freshnessStats?: FreshnessStats;
  citations?: Array<{
    id: string;
    number: number;
    source: string;
    freshness?: FreshnessInfo;
    docId?: string;
    version?: string;
    url?: string;
    filepath?: string;
    authors?: string[];
  }>;

  // Performance metrics
  metrics?: {
    totalDuration: number;
    vectorSearchDuration?: number;
    keywordSearchDuration?: number;
    fusionDuration?: number;
    rerankerDuration?: number;
    guardrailDuration?: number;
    synthesisTime?: number;
    vectorResultCount?: number;
    keywordResultCount?: number;
    finalResultCount?: number;
    documentsReranked?: number;
    rerankingEnabled?: boolean;
  };

  // Synthesis metadata
  synthesisMetadata?: {
    tokensUsed: number;
    modelUsed: string;
    contextTruncated: boolean;
    confidence: number;
    llmProvider?: string;
  };

  // Debug information (optional)
  debug?: {
    hybridSearchConfig?: Record<string, any>;
    rerankerConfig?: Record<string, any>;
    guardrailConfig?: Record<string, any>;
    retrievalSteps?: string[];
  };
}
