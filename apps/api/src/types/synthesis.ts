import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { UserContext, FreshnessInfo, FreshnessStats } from '@cw-rag-core/shared';

// LLM Provider types
export type LLMProvider = 'openai' | 'anthropic' | 'azure-openai' | 'vllm';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  apiVersion?: string; // For Azure OpenAI
  baseURL?: string; // For Azure OpenAI or vLLM
  streaming?: boolean; // For streaming support
  timeoutMs?: number; // Request timeout in milliseconds
}

export interface TenantLLMConfig {
  tenantId: string;
  defaultConfig: LLMConfig;
  fallbackConfigs?: LLMConfig[];
  maxRetries?: number;
  timeoutMs?: number;
}

// Citation types
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

// Answer synthesis types
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

// Streaming response types
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

// Error types
export class AnswerSynthesisError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AnswerSynthesisError';
  }
}

export class LLMProviderError extends AnswerSynthesisError {
  constructor(
    message: string,
    public provider: LLMProvider,
    public originalError?: Error
  ) {
    super(message, 'LLM_PROVIDER_ERROR', { provider, originalError });
  }
}

export class CitationExtractionError extends AnswerSynthesisError {
  constructor(message: string, public documentId: string) {
    super(message, 'CITATION_EXTRACTION_ERROR', { documentId });
  }
}