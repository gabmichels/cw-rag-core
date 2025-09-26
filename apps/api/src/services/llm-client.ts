import { ChatPromptTemplate } from '@langchain/core/prompts';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  LLMConfig,
  LLMProvider,
  TenantLLMConfig,
  LLMProviderError,
  StreamingSynthesisResponse
} from '../types/synthesis.js';
import { createStreamingEventHandler, StreamingEventHandler } from './streaming-event-handler.js';

export interface LLMClient {
  /**
   * Generate completion using the configured model
   */
  generateCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    languageContext?: {
      detectedLanguage: string;
    }
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }>;

  /**
   * Generate streaming completion using the configured model
   */
  generateStreamingCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    signal?: AbortSignal,
    languageContext?: {
      detectedLanguage: string;
    }
  ): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;

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

export class LLMClientImpl implements LLMClient {
  private model: BaseLanguageModel;
  private streamingEventHandler: StreamingEventHandler;

  constructor(private config: LLMConfig) {
    this.model = this.createModel(config);
    this.streamingEventHandler = createStreamingEventHandler();
  }

  async generateCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    languageContext?: {
      detectedLanguage: string;
    }
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }> {
    try {
      // For vLLM, use direct HTTP API
      if (this.config.provider === 'vllm') {
        return this.generateVLLMCompletion(prompt, context, maxTokens, false, guardrailDecision, languageContext);
      }

      // Create the chat prompt template for LangChain providers
      const systemPrompt = this.buildSystemPrompt(guardrailDecision, languageContext);
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', systemPrompt.replace('{context}', context)],
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

  async *generateStreamingCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    signal?: AbortSignal,
    languageContext?: {
      detectedLanguage: string;
    }
  ): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
    if (!this.supportsStreaming()) {
      throw new LLMProviderError(
        `Streaming not supported for provider: ${this.config.provider}`,
        this.config.provider
      );
    }

    try {
      // For vLLM streaming
      if (this.config.provider === 'vllm') {
        yield* this.generateVLLMStreamingCompletion(prompt, context, maxTokens, guardrailDecision, signal, languageContext); // Pass signal and languageContext
        return;
      }

      // For OpenAI and Anthropic providers using LangChain streaming
      if (this.config.provider === 'openai' || this.config.provider === 'anthropic' || this.config.provider === 'azure-openai') {
        yield* this.generateLangChainStreamingCompletion(prompt, context, maxTokens, guardrailDecision, signal, languageContext); // Pass signal and languageContext
        return;
      }

      // Fallback to non-streaming for unsupported providers
      const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision, languageContext);
      yield {
        type: 'chunk',
        data: result.text
      };

      // Emit completion event for fallback
      const completionEvent = this.streamingEventHandler.handleCompletion(
        {
          totalTokens: result.tokensUsed,
          model: result.model,
          finishReason: 'stop'
        },
        this.config.provider
      );
      yield {
        type: 'completion',
        data: completionEvent.data
      };

      yield {
        type: 'done',
        data: null
      };

    } catch (error) {
      yield {
        type: 'error',
        data: error as Error
      };
    }
  }

  getModel(): BaseLanguageModel {
    return this.model;
  }

  getConfig(): LLMConfig {
    return this.config;
  }

  supportsStreaming(): boolean {
    // vLLM always supports streaming
    if (this.config.provider === 'vllm') {
      return true;
    }
    // OpenAI and Anthropic support streaming if enabled
    if (this.config.provider === 'openai' || this.config.provider === 'anthropic') {
      return this.config.streaming !== false; // Default to true unless explicitly disabled
    }
    // For other providers, check the streaming config
    return this.config.streaming === true;
  }

  private async generateVLLMCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    streaming: boolean = false,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    languageContext?: {
      detectedLanguage: string;
    }
  ): Promise<{
    text: string;
    tokensUsed: number;
    model: string;
  }> {
    const systemPrompt = this.buildSystemPrompt(guardrailDecision, languageContext).replace('{context}', context);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const requestBody = {
      model: this.config.model,
      messages,
      max_tokens: maxTokens || this.config.maxTokens || 1000,
      temperature: this.config.temperature || (guardrailDecision?.confidence && guardrailDecision.confidence > 0.7 ? 0.3 : 0.1),
      stream: streaming
    };

    const timeoutMs = this.config.timeoutMs || parseInt(process.env.LLM_TIMEOUT_MS || '25000');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.config.baseURL || process.env.LLM_ENDPOINT!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`vLLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error('No completion choice returned from vLLM');
      }

      const text = choice.message?.content || '';
      const tokensUsed = data.usage?.total_tokens || this.estimateTokens(text);

      return {
        text: text.trim(),
        tokensUsed,
        model: this.config.model
      };

    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  private async *generateVLLMStreamingCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    signal?: AbortSignal,
    languageContext?: {
      detectedLanguage: string;
    }
  ): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
    const systemPrompt = this.buildSystemPrompt(guardrailDecision, languageContext).replace('{context}', context);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    const requestBody = {
      model: this.config.model,
      messages,
      max_tokens: maxTokens || this.config.maxTokens || 1000,
      temperature: this.config.temperature || (guardrailDecision?.confidence && guardrailDecision.confidence > 0.7 ? 0.3 : 0.1),
      stream: true
    };

    const internalController = new AbortController();
    const effectiveSignal = signal || internalController.signal;

    try {
      const response = await fetch(this.config.baseURL || process.env.LLM_ENDPOINT!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(requestBody),
        signal: effectiveSignal
      });

      if (!response.ok) {
        throw new Error(`vLLM API error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      let localTimeoutId: NodeJS.Timeout | null = null; // Declare here to make it accessible in catch block
      if (!signal) { // If no external signal, manage local timeout
        localTimeoutId = setTimeout(() => internalController.abort(new Error('vLLM Streaming timeout')), this.config.timeoutMs || 25000);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalTokens = 0;

      if (effectiveSignal.aborted) throw effectiveSignal.reason || new Error('Streaming aborted before start'); // Check if already aborted
      effectiveSignal.addEventListener('abort', () => reader.cancel('Stream aborted due to timeout'), { once: true });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                yield {
                  type: 'done',
                  data: null
                };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];
                if (choice && choice.delta?.content) {
                  totalTokens += this.estimateTokens(choice.delta.content);
                  console.log('Streaming chunk tokens:', totalTokens);
                  yield {
                    type: 'chunk',
                    data: choice.delta.content
                  };
                }
              } catch (parseError) {
                // Skip malformed JSON
                continue;
              }
            }
          }
        }
      } finally {
        if (localTimeoutId) clearTimeout(localTimeoutId); // Clear local timeout
        reader.releaseLock();
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        yield {
          type: 'error',
          data: new Error('Request timeout')
        };
      } else if (error instanceof Error && error.message.includes('Stream aborted due to timeout')) {
        yield { type: 'error', data: new Error(error.message) };
      } else {
        yield {
          type: 'error',
          data: error as Error
        };
      }
    }
  }

  private async *generateLangChainStreamingCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    signal?: AbortSignal,
    languageContext?: {
      detectedLanguage: string;
    }
  ): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
    const systemPrompt = this.buildSystemPrompt(guardrailDecision, languageContext);
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt.replace('{context}', context)],
      ['human', '{query}']
    ]);

    const formattedPrompt = await promptTemplate.format({
      context,
      query: prompt
    });

    let totalTokens = 0;
    let completionReason = 'stop';
    let modelUsed = this.config.model;

    if (signal?.aborted) {
      yield { type: 'error', data: signal.reason || new Error('Streaming aborted before start') };
      return;
    }
    // LangChain's stream method may not directly support AbortSignal in its options.
    // So we'll check signal.aborted manually within the loop.
    signal?.addEventListener('abort', () => { /* no-op, relying on manual check */ }, { once: true });

    try {
      // Use LangChain's streaming via stream method.
      const streamIterator = await this.model.stream(formattedPrompt);

      for await (const chunk of streamIterator) {
        const content = typeof chunk.content === 'string'
          ? chunk.content
          : chunk.content.toString();

        if (signal?.aborted) {
          yield { type: 'error', data: signal.reason || new Error('Streaming aborted during chunk processing') };
          return; // Exit if aborted
        }

        if (content) {
          totalTokens += this.estimateTokens(content);

          // Emit chunk event
          yield {
            type: 'chunk',
            data: content
          };
        }

        // Extract completion metadata if available
        if (chunk.response_metadata?.finish_reason) {
          completionReason = chunk.response_metadata.finish_reason;
        }
        if (chunk.response_metadata?.model) {
          modelUsed = chunk.response_metadata.model;
        }
      }

      // Emit completion event using the generic handler
      const completionEvent = this.streamingEventHandler.handleCompletion(
        {
          totalTokens,
          finishReason: completionReason,
          model: modelUsed,
          usage: { total_tokens: totalTokens }
        },
        this.config.provider
      );

      yield {
        type: 'completion',
        data: completionEvent.data
      };

      yield {
        type: 'done',
        data: null
      };

    } catch (error) {
      yield {
        type: 'error',
        data: error as Error
      };
    }
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

      case 'vllm':
        // vLLM uses direct HTTP calls, not LangChain models
        // Return a mock model that won't be used
        return new ChatOpenAI({
          modelName: config.model,
          temperature: config.temperature || 0.1,
          maxTokens: 1000,
          openAIApiKey: 'mock-key-for-vllm'
        });

      default:
        throw new LLMProviderError(
          `Unsupported LLM provider: ${config.provider}`,
          config.provider
        );
    }
  }

  private buildSystemPrompt(guardrailDecision?: {
    isAnswerable: boolean;
    confidence: number;
    score: any;
  }, languageContext?: {
    detectedLanguage: string;
  }): string {
    const isAnswerable = guardrailDecision?.isAnswerable;
    const confidence = guardrailDecision?.confidence || 0;
    const detectedLanguage = languageContext?.detectedLanguage || 'EN';

    // Language instructions
    const languageInstructions = `
LANGUAGE INSTRUCTIONS:
- Query language detected: ${detectedLanguage}
- Respond in ${detectedLanguage} as the query was made in that language
- If translating content, preserve technical terms and proper names
- For mixed-language contexts, indicate source language in citations`;

    if (isAnswerable) {
      // Guardrail says it's answerable - always answer, adjust tone based on confidence
      // Use ANSWERABILITY_THRESHOLD as base for tone determination
      const baseThreshold = parseFloat(process.env.ANSWERABILITY_THRESHOLD || '0.6');
      const highThreshold = Math.min(baseThreshold * 1.3, 0.9); // 1.3x base, max 0.9
      const mediumThreshold = baseThreshold; // Use base threshold for medium confidence

      const confidenceLevel = confidence >= highThreshold ? 'HIGH' : confidence >= mediumThreshold ? 'MEDIUM' : 'LOW';
      const confidenceNote = confidenceLevel === 'HIGH' ?
        'Be confident and comprehensive in your response - the relevant information IS present.' :
        confidenceLevel === 'MEDIUM' ?
        'Provide a helpful and complete answer based on the available information.' :
        'Answer the question using the provided context, being appropriately cautious about the confidence level.';

      return `You are a helpful AI assistant that provides answers based on the provided context.
${languageInstructions}

INSTRUCTIONS FOR ANSWERABLE QUERIES:
1. The system has determined this query is ANSWERABLE (confidence: ${(confidence * 100).toFixed(1)}%)
2. Use the information provided in the context below to answer the question
3. ${confidenceNote}

**CRITICAL CITATION REQUIREMENT:**
4. You MUST include inline citations in your response using the format [^1], [^2], etc. for each source you reference
5. EVERY factual statement should be cited to its source document (e.g., "The moon is made of cheese [^1]")
6. Use the document numbers provided in the context (e.g., [Document 1], [Document 2]) to create corresponding citations [^1], [^2]
7. Do NOT invent, hallucinate, or make up any citations - only use the numbered documents provided
8. If multiple sources support the same point, cite all relevant sources (e.g., [^1][^2])

FORMATTING REQUIREMENTS:
9. Provide a clear, well-structured answer in markdown format
10. Answer the question to the best of your ability using the provided context

SPECIAL INSTRUCTIONS FOR TABLES AND STRUCTURED CONTENT:
- When showing skill tables, tier lists, or any structured data, include ALL tiers/rows/entries from the context
- Do NOT omit any skill tiers (Novice, Apprentice, Journeyman, Master, Grandmaster, Legendary, Mythic)
- If the context contains multiple parts of the same table, combine them into one complete table
- Preserve the original structure and formatting of tables as much as possible
- When reconstructing tables, maintain the logical order (e.g., skill progression from lowest to highest tier)

Context:
{context}`;
    } else {
      // Not answerable: use conservative approach with IDK instruction
      return `You are a helpful AI assistant that answers questions based only on the provided context.
${languageInstructions}

STANDARD INSTRUCTIONS:
1. Use ONLY the information provided in the context below
2. If the context doesn't contain enough information to answer the question, respond with "I don't have enough information in the provided context to answer this question."

**CRITICAL CITATION REQUIREMENT:**
3. You MUST include inline citations in your response using the format [^1], [^2], etc. for each source you reference
4. EVERY factual statement should be cited to its source document (e.g., "The moon is made of cheese [^1]")
5. Use the document numbers provided in the context (e.g., [Document 1], [Document 2]) to create corresponding citations [^1], [^2]
6. Do NOT invent, hallucinate, or make up any citations - only use the numbered documents provided
7. If multiple sources support the same point, cite all relevant sources (e.g., [^1][^2])

FORMATTING REQUIREMENTS:
8. Provide a clear, well-structured answer in markdown format

Context:
{context}`;
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
    // Read LLM configuration from environment with OpenAI as default
    const llmEnabled = process.env.LLM_ENABLED === 'true';
    const llmProvider = (process.env.LLM_PROVIDER as LLMProvider) || 'openai';
    const llmModel = process.env.LLM_MODEL || 'gpt-4.1-2025-04-14';
    const llmEndpoint = process.env.LLM_ENDPOINT;
    const llmStreaming = process.env.LLM_STREAMING === 'true';
    const llmTimeout = parseInt(process.env.LLM_TIMEOUT_MS || '25000');

    let defaultConfig: LLMConfig;

    if (llmEnabled && llmProvider === 'vllm') {
      // vLLM configuration for clients who need on-premise deployment
      defaultConfig = {
        provider: 'vllm',
        model: llmModel,
        temperature: 0.1,
        maxTokens: 1000,
        baseURL: llmEndpoint,
        streaming: llmStreaming,
        streamingOptions: {
          enableProviderEvents: true,
          enableCompletionEvents: true,
          bufferSize: 1024,
          flushInterval: 100
        },
        timeoutMs: llmTimeout
      };
    } else {
      // OpenAI/Anthropic default configuration
      defaultConfig = {
        provider: llmProvider as LLMProvider,
        model: llmModel,
        temperature: 0.1,
        maxTokens: 1000,
        streaming: llmStreaming,
        streamingOptions: {
          enableProviderEvents: true,
          enableCompletionEvents: true,
          bufferSize: 512,
          flushInterval: 50
        },
        timeoutMs: llmTimeout
      };
    }

    const tenantConfig: TenantLLMConfig = {
      tenantId: 'default',
      defaultConfig,
      fallbackConfigs: [
        // No fallback for now, remove Anthropic if present
      ],
      maxRetries: 3,
      timeoutMs: llmTimeout
    };

    this.tenantConfigs.set('default', tenantConfig);
  }

  private getDefaultTenantConfig(): TenantLLMConfig {
    // Read LLM configuration from environment with OpenAI as default
    const llmEnabled = process.env.LLM_ENABLED === 'true';
    const llmProvider = (process.env.LLM_PROVIDER as LLMProvider) || 'openai';
    const llmModel = process.env.LLM_MODEL || 'gpt-4.1-2025-04-14';
    const llmEndpoint = process.env.LLM_ENDPOINT;
    const llmStreaming = process.env.LLM_STREAMING === 'true';
    const llmTimeout = parseInt(process.env.LLM_TIMEOUT_MS || '25000');

    let defaultConfig: LLMConfig;

    if (llmEnabled && llmProvider === 'vllm') {
      // vLLM configuration for clients who need on-premise deployment
      defaultConfig = {
        provider: 'vllm',
        model: llmModel,
        temperature: 0.1,
        maxTokens: 1000,
        baseURL: llmEndpoint,
        streaming: llmStreaming,
        streamingOptions: {
          enableProviderEvents: true,
          enableCompletionEvents: true,
          bufferSize: 1024,
          flushInterval: 100
        },
        timeoutMs: llmTimeout
      };
    } else {
      // OpenAI/Anthropic default configuration
      defaultConfig = {
        provider: llmProvider as LLMProvider,
        model: llmModel,
        temperature: 0.1,
        maxTokens: 1000,
        streaming: llmStreaming,
        streamingOptions: {
          enableProviderEvents: true,
          enableCompletionEvents: true,
          bufferSize: 512,
          flushInterval: 50
        },
        timeoutMs: llmTimeout
      };
    }

    return {
      tenantId: 'default',
      defaultConfig,
      fallbackConfigs: [
        // No fallback for now, remove Anthropic if present
      ],
      maxRetries: 3,
      timeoutMs: llmTimeout
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
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    languageContext?: {
      detectedLanguage: string;
    }
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

          const completionPromise = client.generateCompletion(prompt, context, maxTokens, guardrailDecision, languageContext);

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

  async *generateStreamingCompletion(
    prompt: string,
    context: string,
    maxTokens?: number,
    guardrailDecision?: {
      isAnswerable: boolean;
      confidence: number;
      score: any;
    },
    signal?: AbortSignal,
    languageContext?: {
      detectedLanguage: string;
    }
  ): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
    const clients = [this.primaryClient, ...this.fallbackClients];

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      if (!client.supportsStreaming()) {
        continue;
      }

      for (let retry = 0; retry < this.maxRetries; retry++) {
        let timeoutRef: NodeJS.Timeout | null = null;
        const controller = new AbortController();

        // Setup the initial timeout to abort the controller
        const resetTimeout = () => {
          if (timeoutRef) {
            clearTimeout(timeoutRef);
          }
          timeoutRef = setTimeout(() => {
            controller.abort(new Error('Streaming timeout: no chunk received for ' + this.timeoutMs + 'ms'));
          }, this.timeoutMs);
        };

        resetTimeout(); // Start initial timeout

        try {
          for await (const chunk of client.generateStreamingCompletion(prompt, context, maxTokens, guardrailDecision, controller.signal, languageContext)) {
            resetTimeout(); // Reset timeout on each chunk received

            yield chunk;

            if (chunk.type === 'done' || chunk.type === 'error' || controller.signal.aborted) {
              // If the client explicitly signaled done/error, or if the controller was aborted internally,
              // exit the loop and prepare to return.
              break;
            }
          }

          // After the loop, ensure the final timeout is cleared
          if (timeoutRef) {
            clearTimeout(timeoutRef);
            timeoutRef = null;
          }

          return;

        } catch (error) {
          // Ensure timeout is cleared on any error or retry start
          if (timeoutRef) {
            clearTimeout(timeoutRef);
            timeoutRef = null;
          }

          console.warn(`LLM streaming client ${i} attempt ${retry + 1} failed:`, error);

          // If this is the last client and last retry, fall back to non-streaming
          if (i === clients.length - 1 && retry === this.maxRetries - 1) {
            // Fallback to non-streaming completion
            try {
              const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision, languageContext);
              yield {
                type: 'chunk',
                data: result.text
              };
              yield {
                type: 'done',
                data: null
              };
              return;
            } catch (fallbackError) {
              yield {
                type: 'error',
                data: fallbackError as Error
              };
              return;
            }
          }


          // Wait before retry (exponential backoff)
          if (retry < this.maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000));
          }
        }
      }
    }

    // If no streaming clients are available, fallback to non-streaming
    try {
      const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision, languageContext);
      yield {
        type: 'chunk',
        data: result.text
      };
      yield {
        type: 'done',
        data: null
      };
    } catch (error) {
      yield {
        type: 'error',
        data: error as Error
      };
    }
  }

  supportsStreaming(): boolean {
    return this.primaryClient.supportsStreaming() ||
           this.fallbackClients.some(client => client.supportsStreaming());
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