import { BaseRerankerService } from './reranker.js';
import { RERANKER_MODELS } from '../types/reranker.js';
/**
 * Mock reranker service for testing and development
 * Provides deterministic reranking behavior for consistent test results
 */
export class MockRerankerService extends BaseRerankerService {
    delayMs;
    failureRate;
    mockScores;
    constructor(config, options = {}) {
        super(config);
        this.delayMs = options.delayMs || 0;
        this.failureRate = options.failureRate || 0;
        this.mockScores = options.mockScores || new Map();
    }
    async rerank(request) {
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
        const results = [];
        for (const doc of request.documents) {
            const score = this.calculateMockScore(request.query, doc.content, doc.id);
            results.push({
                id: doc.id,
                score,
                content: doc.content,
                payload: doc.payload,
                originalScore: doc.originalScore,
                rerankerScore: score,
                rank: 0 // Will be set after sorting
            });
        }
        // Sort by reranker score descending
        results.sort((a, b) => b.rerankerScore - a.rerankerScore);
        // Apply score threshold and top-K filtering
        let filtered = this.applyScoreThreshold(results);
        filtered = this.applyTopK(filtered);
        // Update ranks
        return filtered.map((result, index) => ({
            ...result,
            rank: index + 1
        }));
    }
    calculateMockScore(query, content, docId) {
        // Check for predefined mock scores first
        if (this.mockScores.has(docId)) {
            return this.mockScores.get(docId);
        }
        // Simple mock scoring based on query-content similarity
        const queryTerms = query.toLowerCase().split(/\s+/);
        const contentLower = content.toLowerCase();
        let matchCount = 0;
        let totalTerms = queryTerms.length;
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
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    async isHealthy() {
        // Mock service is always healthy
        return true;
    }
    getSupportedModels() {
        return Object.values(RERANKER_MODELS).map(model => model.name);
    }
    // Test utilities
    setMockScore(docId, score) {
        this.mockScores.set(docId, score);
    }
    setMockScores(scores) {
        this.mockScores.clear();
        for (const [docId, score] of Object.entries(scores)) {
            this.mockScores.set(docId, score);
        }
    }
    clearMockScores() {
        this.mockScores.clear();
    }
    setFailureRate(rate) {
        this.failureRate = Math.max(0, Math.min(1, rate));
    }
    setDelay(delayMs) {
        this.delayMs = Math.max(0, delayMs);
    }
}
/**
 * Create a mock reranker service with preset configurations for different test scenarios
 */
export class MockRerankerServiceFactory {
    static createFast(config) {
        return new MockRerankerService(config, { delayMs: 0 });
    }
    static createSlow(config) {
        return new MockRerankerService(config, { delayMs: 100 });
    }
    static createUnreliable(config) {
        return new MockRerankerService(config, { failureRate: 0.3, delayMs: 50 });
    }
    static createWithPredefinedScores(config, scores) {
        const mockScores = new Map(Object.entries(scores));
        return new MockRerankerService(config, { mockScores });
    }
    static createPerfectReranker(config) {
        // This mock always ranks documents by a simple relevance heuristic
        return new MockRerankerService(config, { delayMs: 10 });
    }
}
