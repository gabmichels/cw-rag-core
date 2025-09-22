import { BaseRerankerService } from './reranker.js';
import { RERANKER_MODELS } from '../types/reranker.js';
/**
 * Node.js-based reranker service using @xenova/transformers for cross-encoder models
 */
export class SentenceTransformersRerankerService extends BaseRerankerService {
    pipeline = null;
    isInitializing = false;
    constructor(config) {
        super(config);
    }
    async rerank(request) {
        if (!this.config.enabled) {
            return this.passThrough(request);
        }
        await this.initializePipeline();
        try {
            // Process in batches for better performance
            const batchSize = this.config.batchSize || 20;
            const batches = this.createBatches(request.documents, batchSize);
            const allResults = [];
            for (const batch of batches) {
                const batchResults = await this.processBatch(request.query, batch);
                allResults.push(...batchResults);
            }
            // Sort by reranker score descending
            allResults.sort((a, b) => b.rerankerScore - a.rerankerScore);
            // Apply score threshold and top-K filtering
            let filtered = this.applyScoreThreshold(allResults);
            filtered = this.applyTopK(filtered);
            // Update ranks
            return filtered.map((result, index) => ({
                ...result,
                rank: index + 1
            }));
        }
        catch (error) {
            console.error('StructuredLog:RerankerFailure', {
                error: error.message,
                model: this.config.model.name,
                documentCount: request.documents.length
            });
            // Fallback to pass-through
            return this.passThrough(request);
        }
    }
    async initializePipeline() {
        if (this.pipeline || this.isInitializing) {
            return;
        }
        this.isInitializing = true;
        try {
            const { pipeline } = await import('@xenova/transformers');
            // Initialize cross-encoder pipeline
            this.pipeline = await pipeline('text-classification', this.config.model.name, {
                quantized: false, // Use full precision for better accuracy
                revision: 'main'
            });
            console.log('StructuredLog:RerankerServiceInitialized', {
                model: this.config.model.name,
                type: this.config.model.type,
                maxSequenceLength: this.config.model.maxSequenceLength
            });
        }
        catch (error) {
            console.error('StructuredLog:RerankerInitFailure', {
                error: error.message,
                model: this.config.model.name,
                stack: error.stack
            });
            throw new Error(`Failed to initialize reranker service: ${error.message}`);
        }
        finally {
            this.isInitializing = false;
        }
    }
    async processBatch(query, documents) {
        const results = [];
        for (const doc of documents) {
            try {
                // Prepare input for cross-encoder
                const input = this.prepareInput(query, doc.content);
                // Get relevance score
                const output = await this.pipeline(input);
                // Extract score (assuming binary classification with score for relevant class)
                const score = this.extractRelevanceScore(output);
                results.push({
                    id: doc.id,
                    score: score,
                    content: doc.content,
                    payload: doc.payload,
                    originalScore: doc.originalScore,
                    rerankerScore: score,
                    rank: 0 // Will be set later after sorting
                });
            }
            catch (error) {
                console.warn('StructuredLog:DocumentRerankFailure', {
                    documentId: doc.id,
                    error: error.message
                });
                // Fallback: use original score or default
                results.push({
                    id: doc.id,
                    score: doc.originalScore || 0.5,
                    content: doc.content,
                    payload: doc.payload,
                    originalScore: doc.originalScore,
                    rerankerScore: doc.originalScore || 0.5,
                    rank: 0
                });
            }
        }
        return results;
    }
    prepareInput(query, document) {
        // For cross-encoder models, combine query and document
        // Truncate if needed based on model's max sequence length
        const maxLength = this.config.model.maxSequenceLength || 512;
        const combined = `${query} [SEP] ${document}`;
        if (combined.length > maxLength) {
            // Simple truncation strategy - could be improved
            const availableDocLength = maxLength - query.length - 7; // 7 for ' [SEP] '
            const truncatedDoc = document.substring(0, availableDocLength);
            return `${query} [SEP] ${truncatedDoc}`;
        }
        return combined;
    }
    extractRelevanceScore(output) {
        // Handle different output formats from transformers
        if (Array.isArray(output) && output.length > 0) {
            const result = output[0];
            // Look for relevant/positive class score
            if (result.label === 'LABEL_1' || result.label === 'relevant') {
                return result.score;
            }
            // If we have multiple labels, find the highest scoring one
            const maxScoreItem = output.reduce((max, item) => item.score > max.score ? item : max);
            return maxScoreItem.score;
        }
        // Fallback
        return 0.5;
    }
    async isHealthy() {
        try {
            await this.initializePipeline();
            return this.pipeline !== null;
        }
        catch (error) {
            console.error('StructuredLog:RerankerHealthCheckFailed', {
                error: error.message
            });
            return false;
        }
    }
    getSupportedModels() {
        return Object.values(RERANKER_MODELS).map(model => model.name);
    }
}
