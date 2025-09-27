import { BaseRerankerService } from './reranker.js';
import {
  RerankerRequest,
  RerankerResult,
  RerankerConfig,
  RERANKER_MODELS
} from '../types/reranker.js';

/**
 * Mock reranker service for testing and development
 * Provides deterministic reranking behavior for consistent test results
 */
export class MockRerankerService extends BaseRerankerService {
  private delayMs: number;
  private failureRate: number;
  private mockScores: Map<string, number>;

  constructor(
    config: RerankerConfig,
    options: {
      delayMs?: number;
      failureRate?: number;
      mockScores?: Map<string, number>;
    } = {}
  ) {
    super(config);
    this.delayMs = options.delayMs || 0;
    this.failureRate = options.failureRate || 0;
    this.mockScores = options.mockScores || new Map();
  }

  async rerank(request: RerankerRequest): Promise<RerankerResult[]> {
    if (!this.config.enabled) {
      return this.passThrough(request);
    }

    // Simulate processing delay
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    // Simulate random failures
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      throw new Error('Mock reranker failure');
    }

    // Make the operation async to allow timeout to work
    await new Promise(resolve => setTimeout(resolve, 1));

    // Calculate scores and apply threshold filtering
    const results: RerankerResult[] = [];
    for (const doc of request.documents) {
      const score = this.mockScores.has(doc.id) ? this.mockScores.get(doc.id)! : this.calculateMockScore(request.query, doc.content || '', doc.id);

      if (this.config.scoreThreshold && score < this.config.scoreThreshold) {
        continue;
      }

      results.push({
        id: doc.id,
        score,
        content: doc.content,
        payload: doc.payload,
        originalScore: doc.originalScore,
        rerankerScore: score,
        rank: 0
      });
    }

    // Sort by reranker score descending
    results.sort((a, b) => b.rerankerScore - a.rerankerScore);

    // Apply top-K filtering
    const filtered = this.applyTopK(results, request.topK);

    // Update ranks
    return filtered.map((result, index) => ({
      ...result,
      rank: index + 1
    }));
  }

  private calculateMockScore(query: string, content: string, docId: string): number {
    // Check for predefined mock scores first
    if (this.mockScores.has(docId)) {
      return this.mockScores.get(docId)!;
    }

    // Simple mock scoring based on query-content similarity
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    let matchCount = 0;
    const totalTerms = queryTerms.length;

    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matchCount++;
      }
    }

    // Base score from term matching
    let score = totalTerms > 0 ? matchCount / totalTerms : 0.5;

    // Add some variation based on content length (longer content gets slight boost)
    const lengthBoost = Math.min(content.length / 1000, 0.1);
    score += lengthBoost;

    // Add deterministic variation based on document ID hash
    const idHash = this.hashString(docId);
    const variation = (idHash % 100) / 1000; // 0-0.099 variation
    score += variation;

    // Ensure score is in valid range
    return Math.max(0, Math.min(1, score));
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }


  async isHealthy(): Promise<boolean> {
    // Mock service is always healthy
    return true;
  }

  getSupportedModels(): string[] {
    return Object.values(RERANKER_MODELS).map(model => model.name);
  }

  // Test utilities
  setMockScore(docId: string, score: number): void {
    this.mockScores.set(docId, score);
  }

  setMockScores(scores: Record<string, number>): void {
    this.mockScores.clear();
    for (const [docId, score] of Object.entries(scores)) {
      this.mockScores.set(docId, score);
    }
  }

  clearMockScores(): void {
    this.mockScores.clear();
  }

  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  setDelay(delayMs: number): void {
    this.delayMs = Math.max(0, delayMs);
  }
}

/**
 * Create a mock reranker service with preset configurations for different test scenarios
 */
export class MockRerankerServiceFactory {
  static createFast(config: RerankerConfig): MockRerankerService {
    return new MockRerankerService(config, { delayMs: 0 });
  }

  static createSlow(config: RerankerConfig): MockRerankerService {
    return new MockRerankerService(config, { delayMs: 100 });
  }

  static createUnreliable(config: RerankerConfig): MockRerankerService {
    return new MockRerankerService(config, { failureRate: 0.3, delayMs: 50 });
  }

  static createWithPredefinedScores(
    config: RerankerConfig,
    scores: Record<string, number>
  ): MockRerankerService {
    const mockScores = new Map(Object.entries(scores));
    return new MockRerankerService(config, { mockScores });
  }

  static createPerfectReranker(config: RerankerConfig): MockRerankerService {
    // This mock always ranks documents by a simple relevance heuristic
    return new MockRerankerService(config, { delayMs: 10 });
  }
}