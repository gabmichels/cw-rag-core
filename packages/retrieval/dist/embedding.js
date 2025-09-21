import axios from 'axios';
const EMBEDDING_SERVICE_URL = process.env.EMBEDDINGS_URL || 'http://embeddings:80/embed';
const EMBEDDING_DIMENSIONS = 384;
const RETRY_INITIAL_DELAY_MS = 100;
const RETRY_MAX_ATTEMPTS = 3;
/**
 * Applies L2 normalization to a vector.
 * @param vector The input vector.
 * @returns The L2 normalized vector.
 */
function l2Normalize(vector) {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) {
        return vector.map(() => 0); // Handle zero vector to avoid division by zero
    }
    return vector.map(v => v / norm);
}
/**
 * Node.js-based embedding service using @xenova/transformers as fallback
 */
class NodeJsEmbeddingService {
    pipeline = null;
    async initializePipeline() {
        if (!this.pipeline) {
            try {
                // Dynamic import for @xenova/transformers
                const { pipeline } = await import('@xenova/transformers');
                this.pipeline = await pipeline('feature-extraction', 'BAAI/bge-small-en-v1.5', {
                    quantized: false, // Use full precision for better accuracy
                });
                console.log('StructuredLog:NodeJsEmbeddingServiceInitialized', {
                    model: 'BAAI/bge-small-en-v1.5',
                    dimensions: EMBEDDING_DIMENSIONS,
                });
            }
            catch (error) {
                console.error('StructuredLog:NodeJsEmbeddingServiceInitFailure', {
                    error: error.message,
                    stack: error.stack,
                });
                throw new Error(`Failed to initialize Node.js embedding service: ${error.message}`);
            }
        }
    }
    async embed(text) {
        await this.initializePipeline();
        try {
            const output = await this.pipeline(text, { pooling: 'mean', normalize: false });
            const embedding = Array.from(output.data);
            if (embedding.length !== EMBEDDING_DIMENSIONS) {
                throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, but got ${embedding.length}`);
            }
            return l2Normalize(embedding);
        }
        catch (error) {
            console.error('StructuredLog:NodeJsEmbeddingFailure', {
                text: text.substring(0, 100) + '...',
                error: error.message,
                stack: error.stack,
            });
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }
    async embedDocument(document) {
        return this.embed(document.content);
    }
}
export class BgeSmallEnV15EmbeddingService {
    fallbackService = null;
    async callEmbeddingService(texts, attempt = 0) {
        try {
            const response = await axios.post(EMBEDDING_SERVICE_URL, { texts }, { timeout: 5000 });
            if (!response.data ||
                !response.data.embeddings ||
                !Array.isArray(response.data.embeddings)) {
                throw new Error('Invalid response from embedding service');
            }
            return response.data.embeddings;
        }
        catch (error) {
            if (attempt < RETRY_MAX_ATTEMPTS) {
                const delay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Embedding service call failed (attempt ${attempt + 1}). Retrying in ${delay}ms. Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callEmbeddingService(texts, attempt + 1);
            }
            console.error('StructuredLog:EmbeddingServiceFailure', {
                texts,
                error: error.message,
                stack: error.stack,
                attempt,
                serviceUrl: EMBEDDING_SERVICE_URL,
            });
            throw new Error(`Failed to get embeddings after ${attempt} attempts: ${error.message}`);
        }
    }
    async getFallbackService() {
        if (!this.fallbackService) {
            this.fallbackService = new NodeJsEmbeddingService();
        }
        return this.fallbackService;
    }
    async embed(text) {
        try {
            // Try Docker service first
            const embeddings = await this.callEmbeddingService([text]);
            if (embeddings.length === 0 || embeddings[0].length !== EMBEDDING_DIMENSIONS) {
                throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, but got ${embeddings[0]?.length || 0}`);
            }
            return l2Normalize(embeddings[0]);
        }
        catch (error) {
            console.warn('StructuredLog:FallingBackToNodeJsEmbedding', {
                dockerError: error.message,
                text: text.substring(0, 100) + '...',
            });
            // Fall back to Node.js implementation
            const fallbackService = await this.getFallbackService();
            return fallbackService.embed(text);
        }
    }
    async embedDocument(document) {
        // For simplicity, embedding document content directly.
        // In a more complex scenario, this might involve chunking and averaging/concatenating embeddings.
        return this.embed(document.content);
    }
}
