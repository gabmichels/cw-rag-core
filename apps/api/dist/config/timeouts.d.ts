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
export declare const DEFAULT_TIMEOUTS: TimeoutConfig;
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
export declare class TimeoutManager {
    private tenantConfigs;
    constructor();
    /**
     * Get timeout configuration for a tenant
     */
    getTimeoutConfig(tenantId?: string): TimeoutConfig;
    /**
     * Update timeout configuration for a tenant
     */
    updateTenantConfig(config: TenantTimeoutConfig): void;
    /**
     * Execute a function with timeout
     */
    executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number, operationName: string): Promise<T>;
    /**
     * Execute with fallback on timeout
     */
    executeWithFallback<T>(primaryOperation: () => Promise<T>, fallbackOperation: () => Promise<T>, timeoutMs: number, operationName: string): Promise<{
        result: T;
        usedFallback: boolean;
    }>;
    private initializeDefaultConfig;
}
/**
 * Global timeout manager instance
 */
export declare const timeoutManager: TimeoutManager;
