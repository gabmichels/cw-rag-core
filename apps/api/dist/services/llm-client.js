import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { LLMProviderError } from '../types/synthesis.js';
import { createStreamingEventHandler } from './streaming-event-handler.js';
export class LLMClientImpl {
    config;
    model;
    streamingEventHandler;
    constructor(config) {
        this.config = config;
        this.model = this.createModel(config);
        this.streamingEventHandler = createStreamingEventHandler();
    }
    async generateCompletion(prompt, context, maxTokens, guardrailDecision) {
        try {
            // For vLLM, use direct HTTP API
            if (this.config.provider === 'vllm') {
                return this.generateVLLMCompletion(prompt, context, maxTokens, false, guardrailDecision);
            }
            // Create the chat prompt template for LangChain providers
            const systemPrompt = this.buildSystemPrompt(guardrailDecision);
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
        }
        catch (error) {
            throw new LLMProviderError(`Failed to generate completion: ${error.message}`, this.config.provider, error);
        }
    }
    async *generateStreamingCompletion(prompt, context, maxTokens, guardrailDecision) {
        if (!this.supportsStreaming()) {
            throw new LLMProviderError(`Streaming not supported for provider: ${this.config.provider}`, this.config.provider);
        }
        try {
            // For vLLM streaming
            if (this.config.provider === 'vllm') {
                yield* this.generateVLLMStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
                return;
            }
            // For OpenAI and Anthropic providers using LangChain streaming
            if (this.config.provider === 'openai' || this.config.provider === 'anthropic' || this.config.provider === 'azure-openai') {
                yield* this.generateLangChainStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
                return;
            }
            // Fallback to non-streaming for unsupported providers
            const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision);
            yield {
                type: 'chunk',
                data: result.text
            };
            // Emit completion event for fallback
            const completionEvent = this.streamingEventHandler.handleCompletion({
                totalTokens: result.tokensUsed,
                model: result.model,
                finishReason: 'stop'
            }, this.config.provider);
            yield {
                type: 'completion',
                data: completionEvent.data
            };
            yield {
                type: 'done',
                data: null
            };
        }
        catch (error) {
            yield {
                type: 'error',
                data: error
            };
        }
    }
    getModel() {
        return this.model;
    }
    getConfig() {
        return this.config;
    }
    supportsStreaming() {
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
    async generateVLLMCompletion(prompt, context, maxTokens, streaming = false, guardrailDecision) {
        const systemPrompt = this.buildSystemPrompt(guardrailDecision).replace('{context}', context);
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
            const response = await fetch(this.config.baseURL || process.env.LLM_ENDPOINT, {
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
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }
    async *generateVLLMStreamingCompletion(prompt, context, maxTokens, guardrailDecision) {
        const systemPrompt = this.buildSystemPrompt(guardrailDecision).replace('{context}', context);
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
        const timeoutMs = this.config.timeoutMs || parseInt(process.env.LLM_TIMEOUT_MS || '25000');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(this.config.baseURL || process.env.LLM_ENDPOINT, {
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
            if (!response.body) {
                throw new Error('No response body for streaming');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let totalTokens = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
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
                            }
                            catch (parseError) {
                                // Skip malformed JSON
                                continue;
                            }
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                yield {
                    type: 'error',
                    data: new Error('Request timeout')
                };
            }
            else {
                yield {
                    type: 'error',
                    data: error
                };
            }
        }
    }
    async *generateLangChainStreamingCompletion(prompt, context, maxTokens, guardrailDecision) {
        const systemPrompt = this.buildSystemPrompt(guardrailDecision);
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
        try {
            // Use LangChain's streaming via stream method
            const streamIterator = await this.model.stream(formattedPrompt);
            for await (const chunk of streamIterator) {
                const content = typeof chunk.content === 'string'
                    ? chunk.content
                    : chunk.content.toString();
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
            const completionEvent = this.streamingEventHandler.handleCompletion({
                totalTokens,
                finishReason: completionReason,
                model: modelUsed,
                usage: { total_tokens: totalTokens }
            }, this.config.provider);
            yield {
                type: 'completion',
                data: completionEvent.data
            };
            yield {
                type: 'done',
                data: null
            };
        }
        catch (error) {
            yield {
                type: 'error',
                data: error
            };
        }
    }
    createModel(config) {
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
                    throw new LLMProviderError('Azure OpenAI requires baseURL', 'azure-openai');
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
                    maxTokens: config.maxTokens || 1000,
                    openAIApiKey: 'mock-key-for-vllm'
                });
            default:
                throw new LLMProviderError(`Unsupported LLM provider: ${config.provider}`, config.provider);
        }
    }
    buildSystemPrompt(guardrailDecision) {
        const isHighConfidence = guardrailDecision?.confidence && guardrailDecision.confidence > 0.7;
        const isAnswerable = guardrailDecision?.isAnswerable;
        if (isAnswerable && isHighConfidence) {
            // High confidence: encourage confident answers, remove IDK instruction
            return `You are a helpful AI assistant that provides comprehensive answers based on the provided context.

INSTRUCTIONS FOR HIGH-CONFIDENCE QUERIES:
1. The system has determined this query is HIGHLY ANSWERABLE (confidence: ${(guardrailDecision?.confidence * 100).toFixed(1)}%)
2. Use ALL relevant information provided in the context below to give a complete answer
3. Be confident and comprehensive in your response - the relevant information IS present
4. Include inline citations in your response using the format [^1], [^2], etc. for each source you reference
5. Each piece of information should be cited to its source document
6. Do NOT invent, hallucinate, or make up any citations
7. Provide a clear, well-structured answer in markdown format
8. If multiple sources support the same point, cite all relevant sources
9. Since the system has high confidence, provide the best possible answer from the available context

SPECIAL INSTRUCTIONS FOR TABLES AND STRUCTURED CONTENT:
- When showing tables, lists, or any structured data, include ALL rows/entries/information from the context
- If the context contains multiple parts of the same table, combine them into one complete table
- Preserve the original structure and formatting of tables as much as possible
- When reconstructing tables, maintain the logical order (e.g., 1. First Section to N. Last Section)

Context:
{context}`;
        }
        else {
            // Lower confidence or not answerable: use conservative approach
            return `You are a helpful AI assistant that answers questions based only on the provided context.

STANDARD INSTRUCTIONS:
1. Use ONLY the information provided in the context below
2. If the context doesn't contain enough information to answer the question, respond with "I don't have enough information in the provided context to answer this question."
3. Include inline citations in your response using the format [^1], [^2], etc. for each source you reference
4. Each piece of information should be cited to its source document
5. Do NOT invent, hallucinate, or make up any citations
6. Provide a clear, well-structured answer in markdown format
7. If multiple sources support the same point, cite all relevant sources

Context:
{context}`;
        }
    }
    estimateTokens(text) {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }
}
export class LLMClientFactoryImpl {
    tenantConfigs = new Map();
    clientCache = new Map();
    constructor() {
        this.initializeDefaultConfigs();
    }
    async createClientForTenant(tenantId) {
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
    createClient(config) {
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
    async getTenantConfig(tenantId) {
        const config = this.tenantConfigs.get(tenantId);
        if (!config) {
            return this.getDefaultTenantConfig();
        }
        return config;
    }
    async updateTenantConfig(config) {
        this.tenantConfigs.set(config.tenantId, config);
        // Clear related cache entries
        const tenantCacheKey = `tenant:${config.tenantId}`;
        this.clientCache.delete(tenantCacheKey);
    }
    initializeDefaultConfigs() {
        // Read LLM configuration from environment with OpenAI as default
        const llmEnabled = process.env.LLM_ENABLED === 'true';
        const llmProvider = process.env.LLM_PROVIDER || 'openai';
        const llmModel = process.env.LLM_MODEL || 'gpt-4.1-2025-04-14';
        const llmEndpoint = process.env.LLM_ENDPOINT;
        const llmStreaming = process.env.LLM_STREAMING === 'true';
        const llmTimeout = parseInt(process.env.LLM_TIMEOUT_MS || '25000');
        let defaultConfig;
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
        }
        else {
            // OpenAI/Anthropic default configuration
            defaultConfig = {
                provider: llmProvider,
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
        const tenantConfig = {
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
    getDefaultTenantConfig() {
        // Read LLM configuration from environment with OpenAI as default
        const llmEnabled = process.env.LLM_ENABLED === 'true';
        const llmProvider = process.env.LLM_PROVIDER || 'openai';
        const llmModel = process.env.LLM_MODEL || 'gpt-4.1-2025-04-14';
        const llmEndpoint = process.env.LLM_ENDPOINT;
        const llmStreaming = process.env.LLM_STREAMING === 'true';
        const llmTimeout = parseInt(process.env.LLM_TIMEOUT_MS || '25000');
        let defaultConfig;
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
        }
        else {
            // OpenAI/Anthropic default configuration
            defaultConfig = {
                provider: llmProvider,
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
    getConfigKey(config) {
        return `${config.provider}:${config.model}:${config.temperature}:${config.maxTokens}`;
    }
}
/**
 * Resilient LLM client with retry logic and fallbacks
 */
export class ResilientLLMClientFactory extends LLMClientFactoryImpl {
    async createClientForTenant(tenantId) {
        const tenantConfig = await this.getTenantConfig(tenantId);
        return new ResilientLLMClient(tenantConfig.defaultConfig, tenantConfig.fallbackConfigs || [], tenantConfig.maxRetries || 3, tenantConfig.timeoutMs || 30000);
    }
}
/**
 * LLM client with automatic retry and fallback logic
 */
class ResilientLLMClient {
    primaryConfig;
    fallbackConfigs;
    maxRetries;
    timeoutMs;
    primaryClient;
    fallbackClients;
    constructor(primaryConfig, fallbackConfigs, maxRetries, timeoutMs) {
        this.primaryConfig = primaryConfig;
        this.fallbackConfigs = fallbackConfigs;
        this.maxRetries = maxRetries;
        this.timeoutMs = timeoutMs;
        this.primaryClient = new LLMClientImpl(primaryConfig);
        this.fallbackClients = fallbackConfigs.map(config => new LLMClientImpl(config));
    }
    async generateCompletion(prompt, context, maxTokens, guardrailDecision) {
        const clients = [this.primaryClient, ...this.fallbackClients];
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            for (let retry = 0; retry < this.maxRetries; retry++) {
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), this.timeoutMs);
                    });
                    const completionPromise = client.generateCompletion(prompt, context, maxTokens, guardrailDecision);
                    const result = await Promise.race([completionPromise, timeoutPromise]);
                    return result;
                }
                catch (error) {
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
    async *generateStreamingCompletion(prompt, context, maxTokens, guardrailDecision) {
        const clients = [this.primaryClient, ...this.fallbackClients];
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            if (!client.supportsStreaming()) {
                continue; // Skip clients that don't support streaming
            }
            for (let retry = 0; retry < this.maxRetries; retry++) {
                let timeoutId = null;
                let streamingCompleted = false;
                try {
                    const timeoutMs = this.timeoutMs;
                    const generator = client.generateStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
                    // Create a promise-based timeout that can be properly cancelled
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            if (!streamingCompleted) {
                                reject(new Error('Streaming timeout'));
                            }
                        }, timeoutMs);
                    });
                    // Create a generator wrapper that handles the timeout
                    const wrappedGenerator = async function* () {
                        try {
                            for await (const chunk of generator) {
                                yield chunk;
                                if (chunk.type === 'done' || chunk.type === 'error') {
                                    streamingCompleted = true;
                                    if (timeoutId) {
                                        clearTimeout(timeoutId);
                                        timeoutId = null;
                                    }
                                    return;
                                }
                            }
                            streamingCompleted = true;
                        }
                        finally {
                            // Ensure timeout is always cleared
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                                timeoutId = null;
                            }
                        }
                    };
                    // Execute the wrapped generator
                    yield* wrappedGenerator();
                    return;
                }
                catch (error) {
                    // Ensure timeout is cleared on any error
                    streamingCompleted = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    console.warn(`LLM streaming client ${i} attempt ${retry + 1} failed:`, error);
                    // If this is the last client and last retry, fall back to non-streaming
                    if (i === clients.length - 1 && retry === this.maxRetries - 1) {
                        // Fallback to non-streaming completion
                        try {
                            const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision);
                            yield {
                                type: 'chunk',
                                data: result.text
                            };
                            yield {
                                type: 'done',
                                data: null
                            };
                            return;
                        }
                        catch (fallbackError) {
                            yield {
                                type: 'error',
                                data: fallbackError
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
            const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision);
            yield {
                type: 'chunk',
                data: result.text
            };
            yield {
                type: 'done',
                data: null
            };
        }
        catch (error) {
            yield {
                type: 'error',
                data: error
            };
        }
    }
    supportsStreaming() {
        return this.primaryClient.supportsStreaming() ||
            this.fallbackClients.some(client => client.supportsStreaming());
    }
    getModel() {
        return this.primaryClient.getModel();
    }
    getConfig() {
        return this.primaryConfig;
    }
}
/**
 * Factory function for creating LLM client factory
 */
export function createLLMClientFactory(resilient = true) {
    return resilient ? new ResilientLLMClientFactory() : new LLMClientFactoryImpl();
}
