import axios from 'axios';
import { BaseRerankerService } from './reranker.js';
import {
  RerankerRequest,
  RerankerResult,
  RerankerConfig,
  RERANKER_MODELS
} from '../types/reranker.js';

/**
 * HTTP-based reranker service client
 * API format: POST {query, candidates: [{id,text}]} → {scores: number[]}
 */
export class HttpRerankerService extends BaseRerankerService {
  private serviceUrl: string;
  private retryDelayMs: number;

  constructor(
    config: RerankerConfig,
    serviceUrl?: string
  ) {
    super(config);
    this.serviceUrl = serviceUrl || process.env.RERANKER_ENDPOINT || 'http://reranker:8080/rerank';
    this.retryDelayMs = 100;
  }

  async rerank(request: RerankerRequest): Promise<RerankerResult[]> {
    if (!this.config.enabled) {
      return this.passThrough(request);
    }

    try {
      // Process in batches if document count exceeds batch size
      const batchSize = this.config.batchSize || 16;

      if (request.documents.length <= batchSize) {
        return await this.processSingleBatch(request);
      } else {
        return await this.processMultipleBatches(request, batchSize);
      }

    } catch (error) {
      console.error('StructuredLog:HttpRerankerFailure', {
        error: (error as Error).message,
        serviceUrl: this.serviceUrl,
        documentCount: request.documents.length,
        model: this.config.model.name
      });

      // Fallback to pass-through on failure
      return this.passThrough(request);
    }
  }

  private async processSingleBatch(request: RerankerRequest): Promise<RerankerResult[]> {
    // Prepare candidates with token capping
    const candidates = request.documents.map(doc => ({
      id: doc.id,
      text: this.capTokens(doc.content, 512) // Cap to ~512 tokens
    }));

    const httpRequest = {
      query: this.capTokens(request.query, 300), // Cap query to ~300 tokens
      candidates
    };

    const response = await this.withRetry(async () => {
      return await axios.post<{
        scores: number[];
      }>(
        this.serviceUrl,
        httpRequest,
        {
          timeout: this.config.timeoutMs || 500, // Default 500ms timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });

    if (!response.data || !Array.isArray(response.data.scores)) {
      throw new Error('Invalid response from reranker service - expected {scores: number[]}');
    }

    const scores = response.data.scores;
    if (scores.length !== request.documents.length) {
      throw new Error(`Score count mismatch: expected ${request.documents.length}, got ${scores.length}`);
    }

    // Convert response to RerankerResult format
    const results: RerankerResult[] = request.documents.map((doc, index) => ({
      id: doc.id,
      score: scores[index],
      content: doc.content,
      payload: doc.payload,
      originalScore: doc.originalScore,
      rerankerScore: scores[index],
      rank: 0 // Will be set after sorting
    }));

    // Sort by reranker score descending
    results.sort((a, b) => b.rerankerScore - a.rerankerScore);

    // Apply local filtering if needed
    let filtered = this.applyScoreThreshold(results);
    filtered = this.applyTopK(filtered);

    // Update ranks
    return filtered.map((result, index) => ({
      ...result,
      rank: index + 1
    }));
  }

  private async processMultipleBatches(
    request: RerankerRequest,
    batchSize: number
  ): Promise<RerankerResult[]> {
    const batches = this.createBatches(request.documents, batchSize);
    const allResults: RerankerResult[] = [];

    for (const batch of batches) {
      const batchRequest: RerankerRequest = {
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

  /**
   * Cap text to approximately specified number of tokens
   * Simple approximation: ~4 characters per token for English text
   */
  private capTokens(text: string, maxTokens: number): string {
    const approximateTokens = text.length / 4;
    if (approximateTokens <= maxTokens) {
      return text;
    }

    const maxChars = maxTokens * 4;
    return text.substring(0, maxChars);
  }


  async isHealthy(): Promise<boolean> {
    try {
      // Try a simple health check - some services might have /health endpoint
      const response = await axios.get(`${this.serviceUrl.replace('/rerank', '/health')}`, {
        timeout: 3000
      });
      return response.status === 200;
    } catch (error) {
      // If no health endpoint, try a minimal rerank request
      try {
        const testResponse = await axios.post(this.serviceUrl, {
          query: 'test',
          candidates: [{ id: 'test', text: 'test' }]
        }, {
          timeout: 3000
        });
        return testResponse.status === 200 && Array.isArray(testResponse.data?.scores);
      } catch (testError) {
        console.warn('StructuredLog:RerankerHealthCheckFailed', {
          serviceUrl: this.serviceUrl,
          error: (error as Error).message,
          testError: (testError as Error).message
        });
        return false;
      }
    }
  }

  getSupportedModels(): string[] {
    return Object.values(RERANKER_MODELS).map(model => model.name);
  }

  /**
   * Get supported models from the remote service
   */
  async getRemoteSupportedModels(): Promise<string[]> {
    try {
      const response = await axios.get<{ models: string[] }>(`${this.serviceUrl}/models`, {
        timeout: 3000
      });
      return response.data.models || [];
    } catch (error) {
      console.warn('StructuredLog:GetRemoteModelsFailure', {
        serviceUrl: this.serviceUrl,
        error: (error as Error).message
      });
      return this.getSupportedModels();
    }
  }

  /**
   * Set custom service URL
   */
  setServiceUrl(url: string): void {
    this.serviceUrl = url;
  }

  /**
   * Get current service URL
   */
  getServiceUrl(): string {
    return this.serviceUrl;
  }
}

/**
 * Factory for creating HTTP reranker service with fallback
 */
export class HttpRerankerServiceWithFallback extends HttpRerankerService {
  private fallbackService?: BaseRerankerService;

  constructor(
    config: RerankerConfig,
    serviceUrl?: string,
    fallbackService?: BaseRerankerService
  ) {
    super(config, serviceUrl);
    this.fallbackService = fallbackService;
  }

  async rerank(request: RerankerRequest): Promise<RerankerResult[]> {
    try {
      // Try HTTP service first
      return await super.rerank(request);
    } catch (error) {
      console.warn('StructuredLog:HttpRerankerFallback', {
        error: (error as Error).message,
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

  async isHealthy(): Promise<boolean> {
    const httpHealthy = await super.isHealthy();
    if (httpHealthy) return true;

    // Check fallback service health
    if (this.fallbackService) {
      return await this.fallbackService.isHealthy();
    }

    return false;
  }

  setFallbackService(service: BaseRerankerService): void {
    this.fallbackService = service;
  }
}