import axios from 'axios';
import { BaseRerankerService } from './reranker.js';
import { RERANKER_MODELS } from '../types/reranker.js';
/**
 * HTTP-based reranker service client
 * Similar to the embedding service pattern for remote reranker endpoints
 */
export class HttpRerankerService extends BaseRerankerService {
    serviceUrl;
    retryDelayMs;
    constructor(config, serviceUrl) {
        super(config);
        this.serviceUrl = serviceUrl || process.env.RERANKER_SERVICE_URL || 'http://reranker:80/rerank';
        this.retryDelayMs = 100;
    }
    async rerank(request) {
        if (!this.config.enabled) {
            return this.passThrough(request);
        }
        try {
            // Process in batches if document count exceeds batch size
            const batchSize = this.config.batchSize || 20;
            if (request.documents.length <= batchSize) {
                return await this.processSingleBatch(request);
            }
            else {
                return await this.processMultipleBatches(request, batchSize);
            }
        }
        catch (error) {
            console.error('StructuredLog:HttpRerankerFailure', {
                error: error.message,
                serviceUrl: this.serviceUrl,
                documentCount: request.documents.length,
                model: this.config.model.name
            });
            // Fallback to pass-through on failure
            return this.passThrough(request);
        }
    }
    async processSingleBatch(request) {
        const httpRequest = {
            query: request.query,
            documents: request.documents.map(doc => ({
                id: doc.id,
                content: doc.content,
                metadata: doc.payload
            })),
            model: request.model || this.config.model.name,
            top_k: request.topK || this.config.topK
        };
        const response = await this.withRetry(async () => {
            return await axios.post(this.serviceUrl, httpRequest, {
                timeout: this.config.timeoutMs || 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        });
        if (!response.data || !response.data.results || !Array.isArray(response.data.results)) {
            throw new Error('Invalid response from reranker service');
        }
        // Convert response to RerankerResult format
        const results = response.data.results.map((result, index) => {
            const originalDoc = request.documents.find(doc => doc.id === result.id);
            return {
                id: result.id,
                score: result.score,
                content: result.content,
                payload: result.metadata || originalDoc?.payload,
                originalScore: originalDoc?.originalScore,
                rerankerScore: result.score,
                rank: index + 1
            };
        });
        // Apply local filtering if needed
        let filtered = this.applyScoreThreshold(results);
        filtered = this.applyTopK(filtered);
        return filtered;
    }
    async processMultipleBatches(request, batchSize) {
        const batches = this.createBatches(request.documents, batchSize);
        const allResults = [];
        for (const batch of batches) {
            const batchRequest = {
                ...request,
                documents: batch
            };
            const batchResults = await this.processSingleBatch(batchRequest);
            allResults.push(...batchResults);
        }
        // Sort all results by reranker score
        allResults.sort((a, b) => b.rerankerScore - a.rerankerScore);
        // Apply global filtering
        let filtered = this.applyScoreThreshold(allResults);
        filtered = this.applyTopK(filtered);
        // Update ranks
        return filtered.map((result, index) => ({
            ...result,
            rank: index + 1
        }));
    }
    async isHealthy() {
        try {
            const response = await axios.get(`${this.serviceUrl}/health`, {
                timeout: 3000
            });
            return response.status === 200;
        }
        catch (error) {
            console.warn('StructuredLog:RerankerHealthCheckFailed', {
                serviceUrl: this.serviceUrl,
                error: error.message
            });
            return false;
        }
    }
    getSupportedModels() {
        return Object.values(RERANKER_MODELS).map(model => model.name);
    }
    /**
     * Get supported models from the remote service
     */
    async getRemoteSupportedModels() {
        try {
            const response = await axios.get(`${this.serviceUrl}/models`, {
                timeout: 3000
            });
            return response.data.models || [];
        }
        catch (error) {
            console.warn('StructuredLog:GetRemoteModelsFailure', {
                serviceUrl: this.serviceUrl,
                error: error.message
            });
            return this.getSupportedModels();
        }
    }
    /**
     * Set custom service URL
     */
    setServiceUrl(url) {
        this.serviceUrl = url;
    }
    /**
     * Get current service URL
     */
    getServiceUrl() {
        return this.serviceUrl;
    }
}
/**
 * Factory for creating HTTP reranker service with fallback
 */
export class HttpRerankerServiceWithFallback extends HttpRerankerService {
    fallbackService;
    constructor(config, serviceUrl, fallbackService) {
        super(config, serviceUrl);
        this.fallbackService = fallbackService;
    }
    async rerank(request) {
        try {
            // Try HTTP service first
            return await super.rerank(request);
        }
        catch (error) {
            console.warn('StructuredLog:HttpRerankerFallback', {
                error: error.message,
                serviceUrl: this.getServiceUrl(),
                hasFallback: !!this.fallbackService
            });
            // Use fallback service if available
            if (this.fallbackService) {
                return await this.fallbackService.rerank(request);
            }
            // Final fallback to pass-through
            return this.passThrough(request);
        }
    }
    async isHealthy() {
        const httpHealthy = await super.isHealthy();
        if (httpHealthy)
            return true;
        // Check fallback service health
        if (this.fallbackService) {
            return await this.fallbackService.isHealthy();
        }
        return false;
    }
    setFallbackService(service) {
        this.fallbackService = service;
    }
}
