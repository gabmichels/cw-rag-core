/**
 * Timeout configuration for different pipeline stages
 */
export interface TimeoutConfig {
  /** Vector search timeout in milliseconds */
  vectorSearch: number;
  /** Keyword search timeout in milliseconds */
  keywordSearch: number;
  /** Reranker timeout in milliseconds */
  reranker: number;
  /** LLM synthesis timeout in milliseconds */
  llm: number;
  /** Overall request timeout in milliseconds */
  overall: number;
  /** Embedding generation timeout in milliseconds */
  embedding: number;
}

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  vectorSearch: parseInt(process.env.VECTOR_SEARCH_TIMEOUT_MS || '5000'),
  keywordSearch: parseInt(process.env.KEYWORD_SEARCH_TIMEOUT_MS || '3000'),
  reranker: parseInt(process.env.RERANKER_TIMEOUT_MS || '10000'),
  llm: parseInt(process.env.LLM_TIMEOUT_MS || '25000'),
  overall: parseInt(process.env.OVERALL_TIMEOUT_MS || '45000'),
  embedding: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '5000')
};

/**
 * Tenant-specific timeout configurations
 */
export interface TenantTimeoutConfig {
  tenantId: string;
  timeouts: TimeoutConfig;
  fallbackEnabled: boolean;
}

/**
 * Timeout manager for handling per-stage timeouts with graceful fallbacks
 */
export class TimeoutManager {
  private tenantConfigs = new Map<string, TenantTimeoutConfig>();

  constructor() {
    this.initializeDefaultConfig();
  }

  /**
   * Get timeout configuration for a tenant
   */
  getTimeoutConfig(tenantId: string = 'default'): TimeoutConfig {
    const config = this.tenantConfigs.get(tenantId);
    return config?.timeouts || DEFAULT_TIMEOUTS;
  }

  /**
   * Update timeout configuration for a tenant
   */
  updateTenantConfig(config: TenantTimeoutConfig): void {
    this.tenantConfigs.set(config.tenantId, config);
  }

  /**
   * Execute a function with timeout
   */
  async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const promise = operation();

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
        });
      });

      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Execute with fallback on timeout
   */
  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<{ result: T; usedFallback: boolean }> {
    try {
      const result = await this.executeWithTimeout(primaryOperation, timeoutMs, operationName);
      return { result, usedFallback: false };
    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        console.warn(`${operationName} timed out, using fallback`);
        const fallbackResult = await fallbackOperation();
        return { result: fallbackResult, usedFallback: true };
      }
      throw error;
    }
  }

  private initializeDefaultConfig(): void {
    const defaultConfig: TenantTimeoutConfig = {
      tenantId: 'default',
      timeouts: DEFAULT_TIMEOUTS,
      fallbackEnabled: true
    };

    this.tenantConfigs.set('default', defaultConfig);
  }
}

/**
 * Global timeout manager instance
 */
export const timeoutManager = new TimeoutManager();