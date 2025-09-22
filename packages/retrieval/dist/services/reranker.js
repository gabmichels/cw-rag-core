export class BaseRerankerService {
    config;
    constructor(config) {
        this.config = { ...config };
    }
    async rerankWithMetrics(request) {
        const startTime = performance.now();
        const modelLoadStart = performance.now();
        // Perform reranking
        const results = await this.rerank(request);
        const endTime = performance.now();
        const duration = endTime - startTime;
        // Calculate performance metrics
        const metrics = {
            rerankerDuration: duration,
            documentsProcessed: request.documents.length,
            modelLoadDuration: modelLoadStart ? endTime - modelLoadStart : undefined,
            batchCount: Math.ceil(request.documents.length / (this.config.batchSize || 20)),
            avgScoreImprovement: this.calculateAvgScoreImprovement(request.documents, results)
        };
        return { results, metrics };
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Normalize scores to 0-1 range
     */
    normalizeScores(scores) {
        if (scores.length === 0)
            return [];
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const range = maxScore - minScore;
        if (range === 0) {
            return scores.map(() => 1.0);
        }
        return scores.map(score => (score - minScore) / range);
    }
    /**
     * Apply score threshold filtering
     */
    applyScoreThreshold(results) {
        if (!this.config.scoreThreshold)
            return results;
        return results.filter(result => result.rerankerScore >= this.config.scoreThreshold);
    }
    /**
     * Apply top-K filtering
     */
    applyTopK(results) {
        if (!this.config.topK)
            return results;
        return results.slice(0, this.config.topK);
    }
    /**
     * Calculate average score improvement from reranking
     */
    calculateAvgScoreImprovement(documents, results) {
        const docMap = new Map(documents.map(doc => [doc.id, doc.originalScore || 0]));
        let totalImprovement = 0;
        let count = 0;
        for (const result of results) {
            const originalScore = docMap.get(result.id);
            if (originalScore !== undefined) {
                totalImprovement += Math.abs(result.rerankerScore - originalScore);
                count++;
            }
        }
        return count > 0 ? totalImprovement / count : 0;
    }
    /**
     * Pass-through implementation when reranking is disabled or fails
     */
    passThrough(request) {
        return request.documents.map((doc, index) => ({
            id: doc.id,
            score: doc.originalScore || 0.5,
            content: doc.content,
            payload: doc.payload,
            originalScore: doc.originalScore,
            rerankerScore: doc.originalScore || 0.5,
            rank: index + 1
        }));
    }
    /**
     * Create batch groups for processing
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    /**
     * Retry logic for failed operations
     */
    async withRetry(operation, maxAttempts = this.config.retryAttempts || 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxAttempts) {
                    throw lastError;
                }
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
}
