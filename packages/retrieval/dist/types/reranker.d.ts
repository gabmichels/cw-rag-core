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
export declare const RERANKER_MODELS: {
    readonly BGE_RERANKER_LARGE: {
        readonly name: "BAAI/bge-reranker-large";
        readonly type: "cross-encoder";
        readonly maxSequenceLength: 512;
    };
    readonly BGE_RERANKER_BASE: {
        readonly name: "BAAI/bge-reranker-base";
        readonly type: "cross-encoder";
        readonly maxSequenceLength: 512;
    };
    readonly COHERE_RERANK_V3: {
        readonly name: "cohere-rerank-english-v3.0";
        readonly type: "cross-encoder";
        readonly maxSequenceLength: 4096;
    };
};
export type RerankerModelName = keyof typeof RERANKER_MODELS;
export declare const DEFAULT_RERANKER_CONFIG: RerankerConfig;
