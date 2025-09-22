import { BaseRerankerService } from './reranker.js';
import { RERANKER_MODELS, RERANKER_CONFIG } from '../types/reranker.js';
/**
 * Node.js-based reranker service using @xenova/transformers for cross-encoder models
 * LocalRerankerService implementation with token capping and timeout handling
 */
export class SentenceTransformersRerankerService extends BaseRerankerService {
    pipeline = null;
    isInitializing = false;
    constructor(config) {
        super(config);
        // Update config with environment variables if not provided
        this.config.batchSize = this.config.batchSize || RERANKER_CONFIG.BATCH_SIZE;
        this.config.timeoutMs = this.config.timeoutMs || RERANKER_CONFIG.TIMEOUT_MS;
        this.config.topK = this.config.topK || RERANKER_CONFIG.TOPN_OUT;
    }
    async rerank(request) {
        if (!this.config.enabled) {
            return this.passThrough(request);
        }
        await this.initializePipeline();
        const timeoutMs = this.config.timeoutMs || 500;
        try {
            // Apply timeout to the entire rerank operation
            const rerankerPromise = this.performReranking(request);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Reranker timeout')), timeoutMs);
            });
            return await Promise.race([rerankerPromise, timeoutPromise]);
        }
        catch (error) {
            console.error('StructuredLog:RerankerFailure', {
                error: error.message,
                model: this.config.model.name,
                documentCount: request.documents.length,
                timeoutMs
            });
            // Fallback to pass-through with original fusion scores
            return this.passThrough(request);
        }
    }
    async performReranking(request) {
        // Process in batches for better performance
        const batchSize = this.config.batchSize || 16;
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
                // Prepare input for cross-encoder with token capping
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
        // Cap tokens: query ~300 tokens, document ~512 tokens
        const cappedQuery = this.capTokens(query, 300);
        const cappedDocument = this.capTokens(document, 512);
        // For cross-encoder models, combine query and document
        const combined = `${cappedQuery} [SEP] ${cappedDocument}`;
        // Final length check based on model's max sequence length
        const maxLength = this.config.model.maxSequenceLength || 512;
        if (combined.length > maxLength * 4) { // Approximate token to char conversion
            // If still too long, prioritize query and truncate document further
            const availableDocLength = (maxLength * 4) - cappedQuery.length - 7; // 7 for ' [SEP] '
            const finalDoc = cappedDocument.substring(0, Math.max(0, availableDocLength));
            return `${cappedQuery} [SEP] ${finalDoc}`;
        }
        return combined;
    }
    /**
     * Cap text to approximately specified number of tokens
     * Simple approximation: ~4 characters per token for English text
     */
    capTokens(text, maxTokens) {
        const approximateTokens = text.length / 4;
        if (approximateTokens <= maxTokens) {
            return text;
        }
        const maxChars = maxTokens * 4;
        return text.substring(0, maxChars);
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
