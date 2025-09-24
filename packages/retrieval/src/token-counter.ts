/**
 * Token counting utilities for different embedding models
 * Provides accurate token counting for various tokenizers
 */

export interface TokenizerConfig {
  model: string;
  type: 'transformers' | 'tiktoken' | 'custom';
  maxTokens: number;
  safetyMargin: number; // Percentage buffer (0.1 = 10%)
}

export interface TokenCountResult {
  tokenCount: number;
  characterCount: number;
  estimatedTokens: number;
  isWithinLimit: boolean;
  safeTokenLimit: number;
}

/**
 * Abstract token counter interface
 */
export abstract class TokenCounter {
  public config: TokenizerConfig;

  constructor(config: TokenizerConfig) {
    this.config = config;
  }

  abstract countTokens(text: string): Promise<TokenCountResult>;

  /**
   * Get the safe token limit with safety margin applied
   */
  getSafeTokenLimit(): number {
    return Math.floor(this.config.maxTokens * (1 - this.config.safetyMargin));
  }

  /**
   * Quick estimation for performance-critical scenarios
   */
  estimateTokens(text: string): number {
    // Conservative estimation: 1 token ≈ 3.5 characters for English text
    return Math.ceil(text.length / 3.5);
  }
}

/**
 * BGE model token counter using character-based estimation
 * TODO: Integrate with actual transformers tokenizer
 */
export class BGETokenCounter extends TokenCounter {
  async countTokens(text: string): Promise<TokenCountResult> {
    const characterCount = text.length;

    // BGE models typically use BERT-like tokenization
    // More accurate estimation: 1 token ≈ 3.2 characters for BGE models
    const estimatedTokens = Math.ceil(characterCount / 3.2);

    // For now, use estimation as actual count
    // TODO: Implement actual tokenization when transformers library is available
    const tokenCount = estimatedTokens;

    const safeTokenLimit = this.getSafeTokenLimit();
    const isWithinLimit = tokenCount <= safeTokenLimit;

    return {
      tokenCount,
      characterCount,
      estimatedTokens,
      isWithinLimit,
      safeTokenLimit
    };
  }
}

/**
 * OpenAI model token counter using tiktoken
 * TODO: Integrate with tiktoken library
 */
export class OpenAITokenCounter extends TokenCounter {
  async countTokens(text: string): Promise<TokenCountResult> {
    const characterCount = text.length;

    // OpenAI models use tiktoken
    // Estimation: 1 token ≈ 4 characters for GPT models
    const estimatedTokens = Math.ceil(characterCount / 4);

    // For now, use estimation as actual count
    // TODO: Implement tiktoken integration
    const tokenCount = estimatedTokens;

    const safeTokenLimit = this.getSafeTokenLimit();
    const isWithinLimit = tokenCount <= safeTokenLimit;

    return {
      tokenCount,
      characterCount,
      estimatedTokens,
      isWithinLimit,
      safeTokenLimit
    };
  }
}

/**
 * Custom token counter with configurable character-to-token ratio
 */
export class CustomTokenCounter extends TokenCounter {
  private charToTokenRatio: number;

  constructor(config: TokenizerConfig, charToTokenRatio: number = 3.5) {
    super(config);
    this.charToTokenRatio = charToTokenRatio;
  }

  async countTokens(text: string): Promise<TokenCountResult> {
    const characterCount = text.length;
    const estimatedTokens = Math.ceil(characterCount / this.charToTokenRatio);
    const tokenCount = estimatedTokens;

    const safeTokenLimit = this.getSafeTokenLimit();
    const isWithinLimit = tokenCount <= safeTokenLimit;

    return {
      tokenCount,
      characterCount,
      estimatedTokens,
      isWithinLimit,
      safeTokenLimit
    };
  }
}

/**
 * Factory function to create appropriate token counter
 */
export function createTokenCounter(config: TokenizerConfig): TokenCounter {
  switch (config.type) {
    case 'transformers':
      if (config.model.includes('bge')) {
        return new BGETokenCounter(config);
      }
      return new CustomTokenCounter(config);

    case 'tiktoken':
      return new OpenAITokenCounter(config);

    case 'custom':
      return new CustomTokenCounter(config);

    default:
      throw new Error(`Unsupported tokenizer type: ${config.type}`);
  }
}

/**
 * Enhanced token counter with caching and batch processing
 */
export class CachedTokenCounter extends TokenCounter {
  private wrappedTokenCounter: TokenCounter;
  private cache = new Map<string, TokenCountResult>();
  private maxCacheSize = 1000;

  constructor(tokenCounter: TokenCounter) {
    super(tokenCounter.config);
    this.wrappedTokenCounter = tokenCounter;
  }

  async countTokens(text: string): Promise<TokenCountResult> {
    // Use text hash as cache key for large texts
    const cacheKey = text.length > 100
      ? this.hashText(text)
      : text;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = await this.wrappedTokenCounter.countTokens(text);

    // Manage cache size
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  clearCache(): void {
    this.cache.clear();
  }
}