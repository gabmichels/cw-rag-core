/**
 * Configuration schema for embedding services and chunking strategies
 */

export interface EmbeddingServiceCapabilities {
  maxTokens: number;
  maxBatchSize: number;
  dimensions: number;
  supportsBatching: boolean;
  supportsStreaming: boolean;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface ChunkingConfig {
  strategy: 'token-aware' | 'sentence' | 'paragraph' | 'semantic' | 'character';
  maxTokens: number;
  overlapTokens: number;
  minChunkTokens: number;
  safetyMargin: number; // Percentage buffer (0.1 = 10%)
  preserveBoundaries: boolean; // Try to preserve sentence/paragraph boundaries
  fallbackStrategy: 'truncate' | 'split' | 'skip';
}

export interface EmbeddingServiceConfig {
  provider: 'bge' | 'openai' | 'azure' | 'custom';
  model: string;
  url: string;
  capabilities: EmbeddingServiceCapabilities;
  tokenizer: {
    type: 'transformers' | 'tiktoken' | 'custom';
    model?: string;
    charToTokenRatio?: number; // Fallback estimation ratio
  };
  chunking: ChunkingConfig;
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
  };
  timeout: {
    requestTimeoutMs: number;
    batchTimeoutMs: number;
  };
}

/**
 * Default configurations for common embedding services
 */
export const DEFAULT_EMBEDDING_CONFIGS: Record<string, Partial<EmbeddingServiceConfig>> = {
  'bge-small-en-v1.5': {
    provider: 'bge',
    model: 'BAAI/bge-small-en-v1.5',
    capabilities: {
      maxTokens: 512,
      maxBatchSize: 32,
      dimensions: 384,
      supportsBatching: true,
      supportsStreaming: false,
      rateLimit: {
        requestsPerMinute: 1000,
        tokensPerMinute: 500000
      }
    },
    tokenizer: {
      type: 'transformers',
      model: 'BAAI/bge-small-en-v1.5',
      charToTokenRatio: 3.2
    },
    chunking: {
      strategy: 'token-aware',
      maxTokens: 460, // 90% of model limit for safety
      overlapTokens: 50,
      minChunkTokens: 50,
      safetyMargin: 0.1,
      preserveBoundaries: true,
      fallbackStrategy: 'truncate'
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 5000
    },
    timeout: {
      requestTimeoutMs: 5000,
      batchTimeoutMs: 30000
    }
  },

  'text-embedding-ada-002': {
    provider: 'openai',
    model: 'text-embedding-ada-002',
    capabilities: {
      maxTokens: 8191,
      maxBatchSize: 100,
      dimensions: 1536,
      supportsBatching: true,
      supportsStreaming: false,
      rateLimit: {
        requestsPerMinute: 3000,
        tokensPerMinute: 1000000
      }
    },
    tokenizer: {
      type: 'tiktoken',
      model: 'cl100k_base',
      charToTokenRatio: 4.0
    },
    chunking: {
      strategy: 'token-aware',
      maxTokens: 7372, // 90% of model limit for safety
      overlapTokens: 200,
      minChunkTokens: 100,
      safetyMargin: 0.1,
      preserveBoundaries: true,
      fallbackStrategy: 'split'
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000
    },
    timeout: {
      requestTimeoutMs: 30000,
      batchTimeoutMs: 120000
    }
  },

  'text-embedding-3-small': {
    provider: 'openai',
    model: 'text-embedding-3-small',
    capabilities: {
      maxTokens: 8191,
      maxBatchSize: 100,
      dimensions: 1536,
      supportsBatching: true,
      supportsStreaming: false,
      rateLimit: {
        requestsPerMinute: 3000,
        tokensPerMinute: 1000000
      }
    },
    tokenizer: {
      type: 'tiktoken',
      model: 'cl100k_base',
      charToTokenRatio: 4.0
    },
    chunking: {
      strategy: 'token-aware',
      maxTokens: 7372,
      overlapTokens: 200,
      minChunkTokens: 100,
      safetyMargin: 0.1,
      preserveBoundaries: true,
      fallbackStrategy: 'split'
    },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000
    },
    timeout: {
      requestTimeoutMs: 30000,
      batchTimeoutMs: 120000
    }
  }
};

/**
 * Environment variable configuration mapping
 */
export interface EmbeddingEnvironmentConfig {
  provider?: string;
  model?: string;
  url?: string;
  maxTokens?: number;
  dimensions?: number;
  chunkingStrategy?: string;
  overlapTokens?: number;
  safetyMargin?: number;
  retryMaxAttempts?: number;
  timeoutMs?: number;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnvironment(): EmbeddingEnvironmentConfig {
  return {
    provider: process.env.EMBEDDING_PROVIDER,
    model: process.env.EMBEDDING_MODEL || process.env.EMBEDDINGS_MODEL,
    url: process.env.EMBEDDING_URL || process.env.EMBEDDINGS_URL,
    maxTokens: process.env.EMBEDDING_MAX_TOKENS ? parseInt(process.env.EMBEDDING_MAX_TOKENS) : undefined,
    dimensions: process.env.VECTOR_DIM ? parseInt(process.env.VECTOR_DIM) : undefined,
    chunkingStrategy: process.env.EMBEDDING_CHUNKING_STRATEGY,
    overlapTokens: process.env.EMBEDDING_OVERLAP_TOKENS ? parseInt(process.env.EMBEDDING_OVERLAP_TOKENS) : undefined,
    safetyMargin: process.env.EMBEDDING_SAFETY_MARGIN ? parseFloat(process.env.EMBEDDING_SAFETY_MARGIN) : undefined,
    retryMaxAttempts: process.env.EMBEDDING_RETRY_MAX_ATTEMPTS ? parseInt(process.env.EMBEDDING_RETRY_MAX_ATTEMPTS) : undefined,
    timeoutMs: process.env.EMBEDDING_TIMEOUT_MS ? parseInt(process.env.EMBEDDING_TIMEOUT_MS) : undefined
  };
}

/**
 * Merge configurations with priority: environment > provided > defaults
 */
export function mergeConfigurations(
  providedConfig: Partial<EmbeddingServiceConfig>,
  envConfig: EmbeddingEnvironmentConfig,
  defaultConfigKey?: string
): EmbeddingServiceConfig {
  // Start with default configuration if available
  let baseConfig: Partial<EmbeddingServiceConfig> = {};
  if (defaultConfigKey && DEFAULT_EMBEDDING_CONFIGS[defaultConfigKey]) {
    baseConfig = { ...DEFAULT_EMBEDDING_CONFIGS[defaultConfigKey] };
  }

  // Apply provided configuration
  const mergedConfig = {
    ...baseConfig,
    ...providedConfig
  };

  // Apply environment overrides
  if (envConfig.provider) mergedConfig.provider = envConfig.provider as any;
  if (envConfig.model) mergedConfig.model = envConfig.model;
  if (envConfig.url) mergedConfig.url = envConfig.url;

  if (mergedConfig.capabilities) {
    if (envConfig.maxTokens) mergedConfig.capabilities.maxTokens = envConfig.maxTokens;
    if (envConfig.dimensions) mergedConfig.capabilities.dimensions = envConfig.dimensions;
  }

  if (mergedConfig.chunking) {
    if (envConfig.chunkingStrategy) mergedConfig.chunking.strategy = envConfig.chunkingStrategy as any;
    if (envConfig.overlapTokens) mergedConfig.chunking.overlapTokens = envConfig.overlapTokens;
    if (envConfig.safetyMargin) mergedConfig.chunking.safetyMargin = envConfig.safetyMargin;

    // Recalculate maxTokens based on capabilities and safety margin
    if (envConfig.maxTokens && envConfig.safetyMargin !== undefined) {
      mergedConfig.chunking.maxTokens = Math.floor(envConfig.maxTokens * (1 - envConfig.safetyMargin));
    }
  }

  if (mergedConfig.retry && envConfig.retryMaxAttempts) {
    mergedConfig.retry.maxAttempts = envConfig.retryMaxAttempts;
  }

  if (mergedConfig.timeout && envConfig.timeoutMs) {
    mergedConfig.timeout.requestTimeoutMs = envConfig.timeoutMs;
  }

  // Validate required fields
  if (!mergedConfig.provider || !mergedConfig.model || !mergedConfig.url) {
    throw new Error('Missing required embedding service configuration: provider, model, or url');
  }

  return mergedConfig as EmbeddingServiceConfig;
}

/**
 * Validate configuration completeness and consistency
 */
export function validateEmbeddingConfig(config: EmbeddingServiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic required fields
  if (!config.provider) errors.push('Provider is required');
  if (!config.model) errors.push('Model is required');
  if (!config.url) errors.push('URL is required');

  // Capabilities validation
  if (!config.capabilities) {
    errors.push('Capabilities configuration is required');
  } else {
    if (config.capabilities.maxTokens <= 0) errors.push('maxTokens must be positive');
    if (config.capabilities.dimensions <= 0) errors.push('dimensions must be positive');
    if (config.capabilities.maxBatchSize <= 0) errors.push('maxBatchSize must be positive');
  }

  // Chunking validation
  if (!config.chunking) {
    errors.push('Chunking configuration is required');
  } else {
    if (config.chunking.maxTokens <= 0) errors.push('Chunking maxTokens must be positive');
    if (config.chunking.overlapTokens < 0) errors.push('Overlap tokens cannot be negative');
    if (config.chunking.minChunkTokens <= 0) errors.push('minChunkTokens must be positive');
    if (config.chunking.safetyMargin < 0 || config.chunking.safetyMargin >= 1) {
      errors.push('safetyMargin must be between 0 and 1');
    }

    // Logical consistency checks
    if (config.capabilities && config.chunking.maxTokens > config.capabilities.maxTokens) {
      errors.push('Chunking maxTokens cannot exceed service capabilities maxTokens');
    }
    if (config.chunking.overlapTokens >= config.chunking.maxTokens) {
      errors.push('Overlap tokens must be less than max tokens per chunk');
    }
    if (config.chunking.minChunkTokens > config.chunking.maxTokens) {
      errors.push('Minimum chunk tokens cannot exceed maximum chunk tokens');
    }
  }

  // Retry validation
  if (config.retry) {
    if (config.retry.maxAttempts <= 0) errors.push('Retry maxAttempts must be positive');
    if (config.retry.initialDelayMs < 0) errors.push('Initial delay cannot be negative');
    if (config.retry.backoffMultiplier <= 0) errors.push('Backoff multiplier must be positive');
  }

  // Timeout validation
  if (config.timeout) {
    if (config.timeout.requestTimeoutMs <= 0) errors.push('Request timeout must be positive');
    if (config.timeout.batchTimeoutMs <= 0) errors.push('Batch timeout must be positive');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}