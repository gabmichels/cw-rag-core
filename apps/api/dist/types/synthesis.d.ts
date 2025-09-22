import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { UserContext, FreshnessInfo, FreshnessStats } from '@cw-rag-core/shared';
export type LLMProvider = 'openai' | 'anthropic' | 'azure-openai' | 'vllm';
export interface LLMConfig {
    provider: LLMProvider;
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    apiVersion?: string;
    baseURL?: string;
    streaming?: boolean;
    timeoutMs?: number;
}
export interface TenantLLMConfig {
    tenantId: string;
    defaultConfig: LLMConfig;
    fallbackConfigs?: LLMConfig[];
    maxRetries?: number;
    timeoutMs?: number;
}
export interface Citation {
    id: string;
    number: number;
    source: string;
    docId: string;
    version?: string;
    url?: string;
    filepath?: string;
    authors?: string[];
    freshness?: FreshnessInfo | null;
}
export interface CitationMap {
    [citationNumber: string]: Citation;
}
export interface SynthesisRequest {
    query: string;
    documents: HybridSearchResult[];
    userContext: UserContext;
    maxContextLength?: number;
    includeCitations?: boolean;
    answerFormat?: 'markdown' | 'plain';
}
export interface SynthesisResponse {
    answer: string;
    citations: CitationMap;
    tokensUsed: number;
    synthesisTime: number;
    confidence: number;
    modelUsed: string;
    contextTruncated: boolean;
    freshnessStats?: FreshnessStats;
}
export interface StreamingSynthesisResponse {
    type: 'chunk' | 'citations' | 'metadata' | 'error' | 'done';
    data: string | CitationMap | SynthesisMetadata | Error | null;
}
export interface SynthesisMetadata {
    tokensUsed: number;
    synthesisTime: number;
    confidence: number;
    modelUsed: string;
    contextTruncated: boolean;
    freshnessStats?: FreshnessStats;
}
export interface AnswerQualityMetrics {
    answerLength: number;
    citationCount: number;
    contextUtilization: number;
    responseLatency: number;
    llmProvider: string;
    model: string;
}
export declare class AnswerSynthesisError extends Error {
    code: string;
    details?: Record<string, any> | undefined;
    constructor(message: string, code: string, details?: Record<string, any> | undefined);
}
export declare class LLMProviderError extends AnswerSynthesisError {
    provider: LLMProvider;
    originalError?: Error | undefined;
    constructor(message: string, provider: LLMProvider, originalError?: Error | undefined);
}
export declare class CitationExtractionError extends AnswerSynthesisError {
    documentId: string;
    constructor(message: string, documentId: string);
}
