import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { LLMConfig, TenantLLMConfig, StreamingSynthesisResponse } from '../types/synthesis.js';
export interface LLMClient {
    /**
     * Generate completion using the configured model
     */
    generateCompletion(prompt: string, context: string, maxTokens?: number): Promise<{
        text: string;
        tokensUsed: number;
        model: string;
    }>;
    /**
     * Generate streaming completion using the configured model
     */
    generateStreamingCompletion(prompt: string, context: string, maxTokens?: number): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;
    /**
     * Get the underlying LangChain model
     */
    getModel(): BaseLanguageModel;
    /**
     * Get model configuration
     */
    getConfig(): LLMConfig;
    /**
     * Check if streaming is supported
     */
    supportsStreaming(): boolean;
}
export declare class LLMClientImpl implements LLMClient {
    private config;
    private model;
    constructor(config: LLMConfig);
    generateCompletion(prompt: string, context: string, maxTokens?: number): Promise<{
        text: string;
        tokensUsed: number;
        model: string;
    }>;
    generateStreamingCompletion(prompt: string, context: string, maxTokens?: number): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;
    getModel(): BaseLanguageModel;
    getConfig(): LLMConfig;
    supportsStreaming(): boolean;
    private generateVLLMCompletion;
    private generateVLLMStreamingCompletion;
    private createModel;
    private estimateTokens;
}
export interface LLMClientFactory {
    /**
     * Create LLM client for a specific tenant
     */
    createClientForTenant(tenantId: string): Promise<LLMClient>;
    /**
     * Create LLM client with specific configuration
     */
    createClient(config: LLMConfig): LLMClient;
    /**
     * Get tenant configuration
     */
    getTenantConfig(tenantId: string): Promise<TenantLLMConfig>;
    /**
     * Update tenant configuration
     */
    updateTenantConfig(config: TenantLLMConfig): Promise<void>;
}
export declare class LLMClientFactoryImpl implements LLMClientFactory {
    private tenantConfigs;
    private clientCache;
    constructor();
    createClientForTenant(tenantId: string): Promise<LLMClient>;
    createClient(config: LLMConfig): LLMClient;
    getTenantConfig(tenantId: string): Promise<TenantLLMConfig>;
    updateTenantConfig(config: TenantLLMConfig): Promise<void>;
    private initializeDefaultConfigs;
    private getDefaultTenantConfig;
    private getConfigKey;
}
/**
 * Resilient LLM client with retry logic and fallbacks
 */
export declare class ResilientLLMClientFactory extends LLMClientFactoryImpl {
    createClientForTenant(tenantId: string): Promise<LLMClient>;
}
/**
 * Factory function for creating LLM client factory
 */
export declare function createLLMClientFactory(resilient?: boolean): LLMClientFactory;
