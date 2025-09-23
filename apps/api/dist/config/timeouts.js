/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUTS = {
    vectorSearch: parseInt(process.env.VECTOR_SEARCH_TIMEOUT_MS || '5000'),
    keywordSearch: parseInt(process.env.KEYWORD_SEARCH_TIMEOUT_MS || '3000'),
    reranker: parseInt(process.env.RERANKER_TIMEOUT_MS || '10000'),
    llm: parseInt(process.env.LLM_TIMEOUT_MS || '25000'),
    overall: parseInt(process.env.OVERALL_TIMEOUT_MS || '45000'),
    embedding: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '5000')
};
/**
 * Timeout manager for handling per-stage timeouts with graceful fallbacks
 */
export class TimeoutManager {
    tenantConfigs = new Map();
    constructor() {
        this.initializeDefaultConfig();
    }
    /**
     * Get timeout configuration for a tenant
     */
    getTimeoutConfig(tenantId = 'default') {
        const config = this.tenantConfigs.get(tenantId);
        return config?.timeouts || DEFAULT_TIMEOUTS;
    }
    /**
     * Update timeout configuration for a tenant
     */
    updateTenantConfig(config) {
        this.tenantConfigs.set(config.tenantId, config);
    }
    /**
     * Execute a function with timeout
     */
    async executeWithTimeout(operation, timeoutMs, operationName) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);
        try {
            const promise = operation();
            const timeoutPromise = new Promise((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
                });
            });
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * Execute with fallback on timeout
     */
    async executeWithFallback(primaryOperation, fallbackOperation, timeoutMs, operationName) {
        try {
            const result = await this.executeWithTimeout(primaryOperation, timeoutMs, operationName);
            return { result, usedFallback: false };
        }
        catch (error) {
            if (error.message.includes('timeout')) {
                console.warn(`${operationName} timed out, using fallback`);
                const fallbackResult = await fallbackOperation();
                return { result: fallbackResult, usedFallback: true };
            }
            throw error;
        }
    }
    initializeDefaultConfig() {
        const defaultConfig = {
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
