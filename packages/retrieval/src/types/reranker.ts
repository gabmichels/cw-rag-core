export interface RerankerRequest {
  query: string;
  documents: RerankerDocument[];
  model?: string;
  topK?: number;
}

export interface RerankerDocument {
  id: string;
  content: string;
  payload?: Record<string, any>;
  originalScore?: number;
}

export interface RerankerResult {
  id: string;
  score: number;
  content: string;
  payload?: Record<string, any>;
  originalScore?: number;
  rerankerScore: number;
  rank: number;
}

export interface RerankerConfig {
  enabled: boolean;
  model: RerankerModel;
  scoreThreshold?: number;
  topK?: number;
  timeoutMs?: number;
  retryAttempts?: number;
  batchSize?: number;
}

export interface TenantRerankerConfig {
  tenantId: string;
  rerankerEnabled: boolean;
  rerankerConfig?: RerankerConfig;
}

export interface RerankerModel {
  name: string;
  type: 'cross-encoder' | 'sentence-transformer';
  dimensions?: number;
  maxSequenceLength?: number;
}

export interface RerankerPerformanceMetrics {
  rerankerDuration: number;
  documentsProcessed: number;
  modelLoadDuration?: number;
  batchCount: number;
  avgScoreImprovement?: number;
}

// Common reranker models
export const RERANKER_MODELS = {
  BGE_RERANKER_LARGE: {
    name: 'BAAI/bge-reranker-large',
    type: 'cross-encoder' as const,
    maxSequenceLength: 512
  },
  BGE_RERANKER_BASE: {
    name: 'BAAI/bge-reranker-base',
    type: 'cross-encoder' as const,
    maxSequenceLength: 512
  },
  COHERE_RERANK_V3: {
    name: 'cohere-rerank-english-v3.0',
    type: 'cross-encoder' as const,
    maxSequenceLength: 4096
  }
} as const;

export type RerankerModelName = keyof typeof RERANKER_MODELS;

// Default configuration
export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  enabled: true,
  model: RERANKER_MODELS.BGE_RERANKER_LARGE,
  scoreThreshold: 0.0,
  topK: 8,
  timeoutMs: 5000,
  retryAttempts: 3,
  batchSize: 20
};