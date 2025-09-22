import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { LLMProviderError } from '../types/synthesis.js';
export class LLMClientImpl {
    config;
    model;
    constructor(config) {
        this.config = config;
        this.model = this.createModel(config);
    }
    async generateCompletion(prompt, context, maxTokens) {
        try {
            // For vLLM, use direct HTTP API
            if (this.config.provider === 'vllm') {
                return this.generateVLLMCompletion(prompt, context, maxTokens, false);
            }
            // Create the chat prompt template for LangChain providers
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
        }
        catch (error) {
            throw new LLMProviderError(`Failed to generate completion: ${error.message}`, this.config.provider, error);
        }
    }
    async *generateStreamingCompletion(prompt, context, maxTokens) {
        if (!this.supportsStreaming()) {
            throw new LLMProviderError(`Streaming not supported for provider: ${this.config.provider}`, this.config.provider);
        }
        try {
            // For vLLM streaming
            if (this.config.provider === 'vllm') {
                yield* this.generateVLLMStreamingCompletion(prompt, context, maxTokens);
                return;
            }
            // For other providers that support streaming (fallback to non-streaming for now)
            const result = await this.generateCompletion(prompt, context, maxTokens);
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
    async generateVLLMCompletion(prompt, context, maxTokens, streaming = false) {
        const systemPrompt = `You are a helpful AI assistant that answers questions based only on the provided context.

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the context below
2. If the context doesn't contain enough information to answer the question, respond with "I don't have enough information in the provided context to answer this question."
3. Include inline citations in your response using the format [^1], [^2], etc. for each source you reference
4. Each piece of information should be cited to its source document
5. Do NOT invent, hallucinate, or make up any citations
6. Provide a clear, well-structured answer in markdown format
7. If multiple sources support the same point, cite all relevant sources

Context:
${context}`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];
        const requestBody = {
            model: this.config.model,
            messages,
            max_tokens: maxTokens || this.config.maxTokens || 1000,
            temperature: this.config.temperature || 0.1,
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
    async *generateVLLMStreamingCompletion(prompt, context, maxTokens) {
        const systemPrompt = `You are a helpful AI assistant that answers questions based only on the provided context.

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the context below
2. If the context doesn't contain enough information to answer the question, respond with "I don't have enough information in the provided context to answer this question."
3. Include inline citations in your response using the format [^1], [^2], etc. for each source you reference
4. Each piece of information should be cited to its source document
5. Do NOT invent, hallucinate, or make up any citations
6. Provide a clear, well-structured answer in markdown format
7. If multiple sources support the same point, cite all relevant sources

Context:
${context}`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];
        const requestBody = {
            model: this.config.model,
            messages,
            max_tokens: maxTokens || this.config.maxTokens || 1000,
            temperature: this.config.temperature || 0.1,
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
        const llmModel = process.env.LLM_MODEL || 'gpt-4';
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
                timeoutMs: llmTimeout
            };
        }
        else {
            // OpenAI default configuration
            defaultConfig = {
                provider: llmProvider,
                model: llmModel,
                temperature: 0.1,
                maxTokens: 1000,
                timeoutMs: llmTimeout
            };
        }
        const tenantConfig = {
            tenantId: 'default',
            defaultConfig,
            fallbackConfigs: [
                {
                    provider: 'anthropic',
                    model: 'claude-3-sonnet-20240229',
                    temperature: 0.1,
                    maxTokens: 1000
                }
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
        const llmModel = process.env.LLM_MODEL || 'gpt-4';
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
                timeoutMs: llmTimeout
            };
        }
        else {
            // OpenAI default configuration
            defaultConfig = {
                provider: llmProvider,
                model: llmModel,
                temperature: 0.1,
                maxTokens: 1000,
                timeoutMs: llmTimeout
            };
        }
        return {
            tenantId: 'default',
            defaultConfig,
            fallbackConfigs: [
                {
                    provider: 'anthropic',
                    model: 'claude-3-sonnet-20240229',
                    temperature: 0.1,
                    maxTokens: 1000
                }
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
    async generateCompletion(prompt, context, maxTokens) {
        const clients = [this.primaryClient, ...this.fallbackClients];
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            for (let retry = 0; retry < this.maxRetries; retry++) {
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), this.timeoutMs);
                    });
                    const completionPromise = client.generateCompletion(prompt, context, maxTokens);
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
    async *generateStreamingCompletion(prompt, context, maxTokens) {
        const clients = [this.primaryClient, ...this.fallbackClients];
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            if (!client.supportsStreaming()) {
                continue; // Skip clients that don't support streaming
            }
            for (let retry = 0; retry < this.maxRetries; retry++) {
                try {
                    // Create a timeout generator wrapper
                    const timeoutMs = this.timeoutMs;
                    const generator = client.generateStreamingCompletion(prompt, context, maxTokens);
                    let timeoutId;
                    let hasStarted = false;
                    try {
                        for await (const chunk of generator) {
                            if (!hasStarted) {
                                hasStarted = true;
                                // Set timeout for overall streaming operation
                                timeoutId = setTimeout(() => {
                                    throw new Error('Streaming timeout');
                                }, timeoutMs);
                            }
                            yield chunk;
                            if (chunk.type === 'done' || chunk.type === 'error') {
                                clearTimeout(timeoutId);
                                return;
                            }
                        }
                        clearTimeout(timeoutId);
                        return;
                    }
                    catch (streamError) {
                        clearTimeout(timeoutId);
                        throw streamError;
                    }
                }
                catch (error) {
                    console.warn(`LLM streaming client ${i} attempt ${retry + 1} failed:`, error);
                    // If this is the last client and last retry, fall back to non-streaming
                    if (i === clients.length - 1 && retry === this.maxRetries - 1) {
                        // Fallback to non-streaming completion
                        try {
                            const result = await this.generateCompletion(prompt, context, maxTokens);
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
            const result = await this.generateCompletion(prompt, context, maxTokens);
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
