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
    enabled: true,
    model: RERANKER_MODELS.BGE_RERANKER_LARGE,
    scoreThreshold: 0.0,
    topK: 8,
    timeoutMs: 5000,
    retryAttempts: 3,
    batchSize: 20
};
