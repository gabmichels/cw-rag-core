// Common reranker models
export const RERANKER_MODELS = {
    BGE_RERANKER_LARGE: {
        name: 'BAAI/bge-reranker-large',
        type: 'cross-encoder',
        maxSequenceLength: 512
    },
    BGE_RERANKER_BASE: {
        name: 'BAAI/bge-reranker-base',
        type: 'cross-encoder',
        maxSequenceLength: 512
    },
    COHERE_RERANK_V3: {
        name: 'cohere-rerank-english-v3.0',
        type: 'cross-encoder',
        maxSequenceLength: 4096
    }
};
// Default configuration
export const DEFAULT_RERANKER_CONFIG = {
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
};
