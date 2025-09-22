import { ChatPromptTemplate } from '@langchain/core/prompts';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  LLMConfig,
  LLMProvider,
  TenantLLMConfig,
  LLMProviderError
} from '../types/synthesis.js';

export interface LLMClient {
  /**
   * Generate completion using the configured model
   */
  generateCompletion(
    prompt: string,
    context: string,
    maxTokens?: number
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }>;

  /**
   * Get the underlying LangChain model
   */
  getModel(): BaseLanguageModel;

  /**
   * Get model configuration
   */
  getConfig(): LLMConfig;
}

export class LLMClientImpl implements LLMClient {
  private model: BaseLanguageModel;

  constructor(private config: LLMConfig) {
    this.model = this.createModel(config);
  }

  async generateCompletion(
    prompt: string,
    context: string,
    maxTokens?: number
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }> {
    try {
      // Create the chat prompt template
      const promptTemplate = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a helpful AI assistant that answers questions based only on the provided context.

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the context below
2. If the context doesn't contain enough information to answer the question, respond with "I don't have enough information in the provided context to answer this question."
3. Include inline citations in your response using the format [^1], [^2], etc. for each source you reference
4. Each piece of information should be cited to its source document
5. Do NOT invent, hallucinate, or make up any citations
6. Provide a clear, well-structured answer in markdown format
7. If multiple sources support the same point, cite all relevant sources

Context:
{context}`
        ],
        ['human', '{query}']
      ]);

      // Format the prompt with context and query
      const formattedPrompt = await promptTemplate.format({
        context,
        query: prompt
      });

      // Generate response
      const response = await this.model.invoke(formattedPrompt);

      // Extract text content
      const text = typeof response.content === 'string'
        ? response.content
        : response.content.toString();

      // Calculate token usage (approximation if not provided)
      const tokensUsed = this.estimateTokens(formattedPrompt + text);

      return {
        text: text.trim(),
        tokensUsed,
        model: this.config.model
      };

    } catch (error) {
      throw new LLMProviderError(
        `Failed to generate completion: ${(error as Error).message}`,
        this.config.provider,
        error as Error
      );
    }
  }

  getModel(): BaseLanguageModel {
    return this.model;
  }

  getConfig(): LLMConfig {
    return this.config;
  }

  private createModel(config: LLMConfig): BaseLanguageModel {
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          modelName: config.model,
          temperature: config.temperature || 0.1,
          maxTokens: config.maxTokens || 1000,
          openAIApiKey: config.apiKey || process.env.OPENAI_API_KEY
        });

      case 'anthropic':
        return new ChatAnthropic({
          modelName: config.model,
          temperature: config.temperature || 0.1,
          maxTokens: config.maxTokens || 1000,
          anthropicApiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
        });

      case 'azure-openai':
        if (!config.baseURL) {
          throw new LLMProviderError(
            'Azure OpenAI requires baseURL',
            'azure-openai'
          );
        }
        return new ChatOpenAI({
          modelName: config.model,
          temperature: config.temperature || 0.1,
          maxTokens: config.maxTokens || 1000,
          openAIApiKey: config.apiKey || process.env.AZURE_OPENAI_API_KEY,
          configuration: {
            baseURL: config.baseURL
          }
        });

      default:
        throw new LLMProviderError(
          `Unsupported LLM provider: ${config.provider}`,
          config.provider
        );
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
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

export class LLMClientFactoryImpl implements LLMClientFactory {
  private tenantConfigs = new Map<string, TenantLLMConfig>();
  private clientCache = new Map<string, LLMClient>();

  constructor() {
    this.initializeDefaultConfigs();
  }

  async createClientForTenant(tenantId: string): Promise<LLMClient> {
    const cacheKey = `tenant:${tenantId}`;

    // Check cache first
    const cached = this.clientCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get tenant configuration
    const tenantConfig = await this.getTenantConfig(tenantId);

    // Create client with default config
    const client = this.createClient(tenantConfig.defaultConfig);

    // Cache the client
    this.clientCache.set(cacheKey, client);

    return client;
  }

  createClient(config: LLMConfig): LLMClient {
    const configKey = this.getConfigKey(config);

    // Check cache
    const cached = this.clientCache.get(configKey);
    if (cached) {
      return cached;
    }

    // Create new client
    const client = new LLMClientImpl(config);

    // Cache the client
    this.clientCache.set(configKey, client);

    return client;
  }

  async getTenantConfig(tenantId: string): Promise<TenantLLMConfig> {
    const config = this.tenantConfigs.get(tenantId);
    if (!config) {
      return this.getDefaultTenantConfig();
    }
    return config;
  }

  async updateTenantConfig(config: TenantLLMConfig): Promise<void> {
    this.tenantConfigs.set(config.tenantId, config);

    // Clear related cache entries
    const tenantCacheKey = `tenant:${config.tenantId}`;
    this.clientCache.delete(tenantCacheKey);
  }

  private initializeDefaultConfigs(): void {
    const defaultConfig: TenantLLMConfig = {
      tenantId: 'default',
      defaultConfig: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.1,
        maxTokens: 1000
      },
      fallbackConfigs: [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          temperature: 0.1,
          maxTokens: 1000
        }
      ],
      maxRetries: 3,
      timeoutMs: 30000
    };

    this.tenantConfigs.set('default', defaultConfig);
  }

  private getDefaultTenantConfig(): TenantLLMConfig {
    return {
      tenantId: 'default',
      defaultConfig: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.1,
        maxTokens: 1000
      },
      maxRetries: 3,
      timeoutMs: 30000
    };
  }

  private getConfigKey(config: LLMConfig): string {
    return `${config.provider}:${config.model}:${config.temperature}:${config.maxTokens}`;
  }
}

/**
 * Resilient LLM client with retry logic and fallbacks
 */
export class ResilientLLMClientFactory extends LLMClientFactoryImpl {
  async createClientForTenant(tenantId: string): Promise<LLMClient> {
    const tenantConfig = await this.getTenantConfig(tenantId);

    return new ResilientLLMClient(
      tenantConfig.defaultConfig,
      tenantConfig.fallbackConfigs || [],
      tenantConfig.maxRetries || 3,
      tenantConfig.timeoutMs || 30000
    );
  }
}

/**
 * LLM client with automatic retry and fallback logic
 */
class ResilientLLMClient implements LLMClient {
  private primaryClient: LLMClient;
  private fallbackClients: LLMClient[];

  constructor(
    private primaryConfig: LLMConfig,
    private fallbackConfigs: LLMConfig[],
    private maxRetries: number,
    private timeoutMs: number
  ) {
    this.primaryClient = new LLMClientImpl(primaryConfig);
    this.fallbackClients = fallbackConfigs.map(config => new LLMClientImpl(config));
  }

  async generateCompletion(
    prompt: string,
    context: string,
    maxTokens?: number
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }> {
    const clients = [this.primaryClient, ...this.fallbackClients];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      for (let retry = 0; retry < this.maxRetries; retry++) {
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), this.timeoutMs);
          });

          const completionPromise = client.generateCompletion(prompt, context, maxTokens);

          const result = await Promise.race([completionPromise, timeoutPromise]);

          return result;

        } catch (error) {
          console.warn(`LLM client ${i} attempt ${retry + 1} failed:`, error);

          // If this is the last client and last retry, throw the error
          if (i === clients.length - 1 && retry === this.maxRetries - 1) {
            throw error;
          }

          // Wait before retry (exponential backoff)
          if (retry < this.maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000));
          }
        }
      }
    }

    throw new LLMProviderError('All LLM clients failed', this.primaryConfig.provider);
  }

  getModel(): BaseLanguageModel {
    return this.primaryClient.getModel();
  }

  getConfig(): LLMConfig {
    return this.primaryConfig;
  }
}

/**
 * Factory function for creating LLM client factory
 */
export function createLLMClientFactory(resilient: boolean = true): LLMClientFactory {
  return resilient ? new ResilientLLMClientFactory() : new LLMClientFactoryImpl();
}