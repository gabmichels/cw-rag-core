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
  enabled: process.env.RERANKER_ENABLED === 'true',
  model: RERANKER_MODELS.BGE_RERANKER_LARGE,
  scoreThreshold: 0.0,
  topK: parseInt(process.env.RERANKER_TOPN_OUT || '8', 10),
  timeoutMs: parseInt(process.env.RERANKER_TIMEOUT_MS || '500', 10),
  retryAttempts: 3,
  batchSize: parseInt(process.env.RERANKER_BATCH || '16', 10)
};

// Additional environment-based configuration
export const RERANKER_CONFIG = {
  ENABLED: process.env.RERANKER_ENABLED === 'true',
  MODEL: process.env.RERANKER_MODEL || 'BAAI/bge-reranker-large',
  ENDPOINT: process.env.RERANKER_ENDPOINT || 'http://reranker:8080/rerank',
  TOPN_IN: parseInt(process.env.RERANKER_TOPN_IN || '20', 10),
  TOPN_OUT: parseInt(process.env.RERANKER_TOPN_OUT || '8', 10),
  TIMEOUT_MS: parseInt(process.env.RERANKER_TIMEOUT_MS || '500', 10),
  BATCH_SIZE: parseInt(process.env.RERANKER_BATCH || '16', 10)
} as const;