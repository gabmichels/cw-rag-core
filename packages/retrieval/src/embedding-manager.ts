/**
 * Embedding service abstraction layer with capability detection and intelligent chunking
 */

import axios, { AxiosError } from 'axios';
import { TokenCounter, createTokenCounter, CachedTokenCounter } from './token-counter.js';
import { AdaptiveChunker, ChunkingResult, ChunkResult } from './adaptive-chunker.js';
import {
  EmbeddingServiceConfig,
  EmbeddingServiceCapabilities,
  DEFAULT_EMBEDDING_CONFIGS,
  loadConfigFromEnvironment,
  mergeConfigurations,
  validateEmbeddingConfig
} from './embedding-config.js';

export interface EmbeddingRequest {
  text: string;
  metadata?: Record<string, any>;
}

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
  chunkId?: string;
  metadata?: Record<string, any>;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  chunksProcessed: number;
  processingTime: number;
  warnings: string[];
}

export interface ServiceHealthCheck {
  healthy: boolean;
  capabilities?: EmbeddingServiceCapabilities;
  responseTime: number;
  version?: string;
  error?: string;
}

/**
 * Enhanced embedding service interface
 */
export interface EnhancedEmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: { content: string; [key: string]: any }): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  embedWithChunking(text: string, documentId: string): Promise<BatchEmbeddingResult>;
  getCapabilities(): Promise<EmbeddingServiceCapabilities>;
  healthCheck(): Promise<ServiceHealthCheck>;
}

/**
 * Main embedding service manager that orchestrates everything
 */
export class EmbeddingServiceManager implements EnhancedEmbeddingService {
  private config: EmbeddingServiceConfig;
  private tokenCounter: CachedTokenCounter;
  private chunker: AdaptiveChunker;
  private capabilities?: EmbeddingServiceCapabilities;
  private lastHealthCheck?: ServiceHealthCheck;
  private healthCheckCache = new Map<string, { result: ServiceHealthCheck; timestamp: number }>();

  constructor(config?: Partial<EmbeddingServiceConfig>) {
    // Load and merge configuration
    const envConfig = loadConfigFromEnvironment();
    const defaultConfigKey = envConfig.model || 'bge-small-en-v1.5';

    this.config = mergeConfigurations(
      config || {},
      envConfig,
      defaultConfigKey
    );

    // Validate configuration
    const validation = validateEmbeddingConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Invalid embedding configuration: ${validation.errors.join(', ')}`);
    }

    // Initialize components
    const baseTokenCounter = createTokenCounter({
      model: this.config.model,
      type: this.config.tokenizer.type,
      maxTokens: this.config.capabilities.maxTokens,
      safetyMargin: this.config.chunking.safetyMargin
    });

    this.tokenCounter = new CachedTokenCounter(baseTokenCounter);
    this.chunker = new AdaptiveChunker(baseTokenCounter, this.config.chunking);

    console.log('StructuredLog:EmbeddingServiceManagerInitialized', {
      provider: this.config.provider,
      model: this.config.model,
      maxTokens: this.config.capabilities.maxTokens,
      chunkingStrategy: this.config.chunking.strategy,
      url: this.config.url
    });
  }

  /**
   * Simple embedding for single text (backward compatibility)
   */
  async embed(text: string): Promise<number[]> {
    const tokenResult = await this.tokenCounter.countTokens(text);

    if (tokenResult.isWithinLimit) {
      // Text fits in single request
      return this.callEmbeddingService([text]).then(results => results[0]);
    } else {
      // Text too large, use chunking and average embeddings
      console.warn('StructuredLog:TextTooLargeForDirectEmbedding', {
        textLength: text.length,
        tokenCount: tokenResult.tokenCount,
        maxTokens: tokenResult.safeTokenLimit,
        fallbackStrategy: 'chunking_with_averaging'
      });

      const chunkingResult = await this.chunker.chunk(text, 'temp_doc');
      if (chunkingResult.chunks.length === 0) {
        throw new Error('Failed to chunk text for embedding');
      }

      // Get embeddings for all chunks
      const chunkTexts = chunkingResult.chunks.map(chunk => chunk.text);
      const embeddings = await this.callEmbeddingService(chunkTexts);

      // Average the embeddings
      return this.averageEmbeddings(embeddings);
    }
  }

  /**
   * Document embedding with intelligent chunking
   */
  async embedDocument(document: { content: string; [key: string]: any }): Promise<number[]> {
    return this.embed(document.content);
  }

  /**
   * Batch embedding for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Check if all texts fit within limits
    const validTexts: string[] = [];
    const chunkedTexts: { originalIndex: number; chunks: string[] }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const tokenResult = await this.tokenCounter.countTokens(text);

      if (tokenResult.isWithinLimit) {
        validTexts.push(text);
      } else {
        // Need to chunk this text
        const chunkingResult = await this.chunker.chunk(text, `batch_${i}`);
        chunkedTexts.push({
          originalIndex: i,
          chunks: chunkingResult.chunks.map(chunk => chunk.text)
        });
      }
    }

    // Process valid texts
    const results: number[][] = new Array(texts.length);

    if (validTexts.length > 0) {
      const validEmbeddings = await this.callEmbeddingService(validTexts);
      let validIndex = 0;

      for (let i = 0; i < texts.length; i++) {
        const tokenResult = await this.tokenCounter.countTokens(texts[i]);
        if (tokenResult.isWithinLimit) {
          results[i] = validEmbeddings[validIndex++];
        }
      }
    }

    // Process chunked texts
    for (const chunkedText of chunkedTexts) {
      const chunkEmbeddings = await this.callEmbeddingService(chunkedText.chunks);
      results[chunkedText.originalIndex] = this.averageEmbeddings(chunkEmbeddings);
    }

    return results;
  }

  /**
   * Advanced embedding with full chunking support and metadata
   */
  async embedWithChunking(text: string, documentId: string): Promise<BatchEmbeddingResult> {
    const startTime = performance.now();
    const warnings: string[] = [];

    console.log('StructuredLog:EmbeddingWithChunking', {
      documentId,
      textLength: text.length,
      chunkingStrategy: this.config.chunking.strategy
    });

    // Analyze text and get chunking recommendation
    const analysis = await this.chunker.analyzeText(text);
    if (analysis.suggestedStrategy !== this.config.chunking.strategy) {
      warnings.push(`Suggested strategy: ${analysis.suggestedStrategy}, using: ${this.config.chunking.strategy}`);
    }

    // Perform chunking
    const chunkingResult = await this.chunker.chunk(text, documentId);
    warnings.push(...chunkingResult.warnings);

    if (chunkingResult.chunks.length === 0) {
      throw new Error('No chunks generated from text');
    }

    console.log('StructuredLog:ChunkingComplete', {
      documentId,
      chunksGenerated: chunkingResult.chunks.length,
      strategy: chunkingResult.strategy,
      totalTokens: chunkingResult.totalTokens
    });

    // Process chunks in batches to respect rate limits
    const embeddings: EmbeddingResult[] = [];
    const batchSize = this.config.capabilities.maxBatchSize || 32;

    for (let i = 0; i < chunkingResult.chunks.length; i += batchSize) {
      const batchChunks = chunkingResult.chunks.slice(i, i + batchSize);
      const batchTexts = batchChunks.map(chunk => chunk.text);

      try {
        const batchEmbeddings = await this.callEmbeddingService(batchTexts);

        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          embeddings.push({
            embedding: batchEmbeddings[j],
            tokenCount: chunk.tokenCount,
            chunkId: chunk.id,
            metadata: {
              ...chunk.metadata,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
              sectionPath: chunk.sectionPath
            }
          });
        }

        console.log('StructuredLog:BatchEmbeddingComplete', {
          documentId,
          batchIndex: Math.floor(i / batchSize),
          batchSize: batchChunks.length,
          totalBatches: Math.ceil(chunkingResult.chunks.length / batchSize)
        });

        // Rate limiting pause between batches
        if (i + batchSize < chunkingResult.chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error('StructuredLog:BatchEmbeddingError', {
          documentId,
          batchIndex: Math.floor(i / batchSize),
          error: (error as Error).message
        });
        throw error;
      }
    }

    const processingTime = performance.now() - startTime;

    console.log('StructuredLog:EmbeddingWithChunkingComplete', {
      documentId,
      chunksProcessed: embeddings.length,
      totalTokens: chunkingResult.totalTokens,
      processingTime: Math.round(processingTime),
      warnings: warnings.length
    });

    return {
      embeddings,
      totalTokens: chunkingResult.totalTokens,
      chunksProcessed: embeddings.length,
      processingTime,
      warnings
    };
  }

  /**
   * Get service capabilities (cached)
   */
  async getCapabilities(): Promise<EmbeddingServiceCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    // Try to detect capabilities from service
    try {
      const health = await this.healthCheck();
      if (health.capabilities) {
        this.capabilities = health.capabilities;
        return this.capabilities;
      }
    } catch (error) {
      console.warn('Failed to detect capabilities from service, using configuration');
    }

    // Fall back to configured capabilities
    this.capabilities = this.config.capabilities;
    return this.capabilities;
  }

  /**
   * Health check with capability detection
   */
  async healthCheck(): Promise<ServiceHealthCheck> {
    const cacheKey = this.config.url;
    const cached = this.healthCheckCache.get(cacheKey);

    // Use cached result if less than 5 minutes old
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.result;
    }

    const startTime = performance.now();

    try {
      // Try health endpoint first
      const healthUrl = this.config.url.replace('/embed', '/health');
      const response = await axios.get(healthUrl, {
        timeout: this.config.timeout.requestTimeoutMs
      });

      const responseTime = performance.now() - startTime;

      const result: ServiceHealthCheck = {
        healthy: true,
        responseTime,
        capabilities: this.config.capabilities, // Could be enhanced with actual service response
        version: response.data?.version
      };

      // Cache the result
      this.healthCheckCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      this.lastHealthCheck = result;
      return result;

    } catch (error) {
      const responseTime = performance.now() - startTime;

      const result: ServiceHealthCheck = {
        healthy: false,
        responseTime,
        error: (error as Error).message
      };

      this.lastHealthCheck = result;
      return result;
    }
  }

  /**
   * Core embedding service call with retry logic
   */
  private async callEmbeddingService(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        console.log('StructuredLog:EmbeddingServiceCall', {
          attempt: attempt + 1,
          textsCount: texts.length,
          totalChars: texts.reduce((sum, t) => sum + t.length, 0)
        });

        const response = await axios.post<number[][]>(
          this.config.url,
          { inputs: texts },
          {
            timeout: this.config.timeout.requestTimeoutMs,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.data || !Array.isArray(response.data)) {
          throw new Error('Invalid response format from embedding service');
        }

        // Validate dimensions
        const expectedDimensions = this.config.capabilities.dimensions;
        for (let i = 0; i < response.data.length; i++) {
          const embedding = response.data[i];
          if (!Array.isArray(embedding) || embedding.length !== expectedDimensions) {
            throw new Error(`Invalid embedding dimensions: expected ${expectedDimensions}, got ${embedding?.length || 'undefined'}`);
          }
        }

        console.log('StructuredLog:EmbeddingServiceSuccess', {
          attempt: attempt + 1,
          embeddingsCount: response.data.length,
          dimensions: response.data[0]?.length
        });

        return response.data;

      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error as Error);

        console.warn('StructuredLog:EmbeddingServiceError', {
          attempt: attempt + 1,
          maxAttempts: this.config.retry.maxAttempts,
          error: lastError.message,
          isRetryable,
          willRetry: isRetryable && attempt < this.config.retry.maxAttempts - 1
        });

        if (!isRetryable || attempt === this.config.retry.maxAttempts - 1) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(
          this.config.retry.initialDelayMs * Math.pow(this.config.retry.backoffMultiplier, attempt),
          this.config.retry.maxDelayMs
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Embedding service failed after ${this.config.retry.maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof AxiosError) {
      // 413 Payload Too Large - not retryable, needs chunking
      if (error.response?.status === 413) {
        return false;
      }

      // 429 Rate Limited - retryable
      if (error.response?.status === 429) {
        return true;
      }

      // 5xx Server Errors - retryable
      if (error.response?.status && error.response.status >= 500) {
        return true;
      }

      // Network errors - retryable
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        return true;
      }
    }

    return false;
  }

  /**
   * Average multiple embeddings into a single embedding
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      throw new Error('Cannot average empty embeddings array');
    }

    if (embeddings.length === 1) {
      return embeddings[0];
    }

    const dimensions = embeddings[0].length;
    const averaged = new Array(dimensions).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        averaged[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      averaged[i] /= embeddings.length;
    }

    return averaged;
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (useful for runtime updates)
   */
  updateConfig(newConfig: Partial<EmbeddingServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Reinitialize components if needed
    if (newConfig.tokenizer || newConfig.capabilities) {
      const baseTokenCounter = createTokenCounter({
        model: this.config.model,
        type: this.config.tokenizer.type,
        maxTokens: this.config.capabilities.maxTokens,
        safetyMargin: this.config.chunking.safetyMargin
      });

      this.tokenCounter = new CachedTokenCounter(baseTokenCounter);
    }

    if (newConfig.chunking) {
      this.chunker = new AdaptiveChunker(this.tokenCounter, this.config.chunking);
    }

    // Clear capability cache
    this.capabilities = undefined;
    this.healthCheckCache.clear();
  }
}

/**
 * Factory function to create embedding service manager with auto-detection
 */
export async function createEmbeddingServiceManager(config?: Partial<EmbeddingServiceConfig>): Promise<EmbeddingServiceManager> {
  const manager = new EmbeddingServiceManager(config);

  // Perform initial health check to validate configuration
  try {
    const health = await manager.healthCheck();
    if (!health.healthy) {
      console.warn('StructuredLog:EmbeddingServiceUnhealthy', {
        error: health.error,
        responseTime: health.responseTime
      });
    }
  } catch (error) {
    console.warn('StructuredLog:EmbeddingServiceHealthCheckFailed', {
      error: (error as Error).message
    });
  }

  return manager;
}