import axios from 'axios';

// Temporary Document interface to bypass import issues
interface DocumentMetadata {
  tenantId: string;
  docId: string;
  acl: string[];
  [key: string]: unknown;
}

interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: Document): Promise<number[]>;
}

const EMBEDDING_SERVICE_URL = process.env.EMBEDDINGS_URL || process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8080/embed';
const EMBEDDING_DIMENSIONS = 384;
const RETRY_INITIAL_DELAY_MS = 100;
const RETRY_MAX_ATTEMPTS = 2; // 1 initial + 2 retries = 3 total attempts

/**
 * Applies L2 normalization to a vector.
 * @param vector The input vector.
 * @returns The L2 normalized vector.
 */
function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) {
    return vector.map(() => 0); // Handle zero vector to avoid division by zero
  }
  return vector.map(v => v / norm);
}

/**
 * Node.js-based embedding service using @xenova/transformers as fallback
 */
class NodeJsEmbeddingService implements EmbeddingService {
  private pipeline: any = null;

  private async initializePipeline() {
    if (!this.pipeline) {
      try {
        // Conditional import to avoid Jest ES module issues
        let transformers;
        if (process.env.NODE_ENV === 'test' && process.env.TEST_FALLBACK !== 'true') {
          // In test environment, throw error to test fallback behavior
          throw new Error('Node.js embedding service unavailable in test environment');
        } else {
          // Dynamic import for @xenova/transformers with better ES module handling
          transformers = await import('@xenova/transformers');
        }
        this.pipeline = await transformers.pipeline('feature-extraction', 'BAAI/bge-small-en-v1.5', {
          quantized: false, // Use full precision for better accuracy
        });
        console.log('StructuredLog:NodeJsEmbeddingServiceInitialized', {
          model: 'BAAI/bge-small-en-v1.5',
          dimensions: EMBEDDING_DIMENSIONS,
        });
      } catch (error: any) {
        console.error('StructuredLog:NodeJsEmbeddingServiceInitFailure', {
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`Failed to initialize Node.js embedding service: ${error.message}`);
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    await this.initializePipeline();

    try {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: false });
      const embedding = Array.from(output.data) as number[];

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, but got ${embedding.length}`);
      }

      return l2Normalize(embedding);
    } catch (error: any) {
      console.error('StructuredLog:NodeJsEmbeddingFailure', {
        text: text.substring(0, 100) + '...',
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  async embedDocument(document: Document): Promise<number[]> {
    return this.embed(document.content);
  }
}

export class BgeSmallEnV15EmbeddingService implements EmbeddingService {
  private fallbackService: NodeJsEmbeddingService | null = null;

  private async callEmbeddingService(
    texts: string[],
    attempt: number = 0,
  ): Promise<number[][]> {
    try {
      // HuggingFace text-embeddings-inference expects 'inputs' field
      const response = await axios.post<number[][]>(
        EMBEDDING_SERVICE_URL,
        { inputs: texts },
        { timeout: 5000 }, // 5 second timeout
      );
      if (
        !response.data ||
        !Array.isArray(response.data)
      ) {
        throw new Error('Invalid response from embedding service');
      }
      return response.data;
    } catch (error: any) {
      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delay = RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `Embedding service call failed (attempt ${
            attempt + 1
          }). Retrying in ${delay}ms. Error: ${error.message}`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callEmbeddingService(texts, attempt + 1);
      }
      console.error('StructuredLog:EmbeddingServiceFailure', {
        texts,
        error: error.message,
        stack: error.stack,
        attempt: attempt + 1, // Convert zero-indexed to total attempts
        serviceUrl: EMBEDDING_SERVICE_URL,
      });
      throw new Error(`Failed to get embeddings after 3 attempts: ${error.message}`);
    }
  }

  private async getFallbackService(): Promise<NodeJsEmbeddingService> {
    if (!this.fallbackService) {
      this.fallbackService = new NodeJsEmbeddingService();
    }
    return this.fallbackService;
  }

  async embed(text: string): Promise<number[]> {
    try {
      // Try Docker service first
      const embeddings = await this.callEmbeddingService([text]);
      if (embeddings.length === 0 || embeddings[0].length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, but got ${embeddings[0]?.length || 0}`);
      }
      return l2Normalize(embeddings[0]);
    } catch (error: any) {
      // Only fallback on connection errors, not validation errors
      if (error.message.includes('Expected') || error.message.includes('after') && error.message.includes('attempts')) {
        // Re-throw validation and retry exhaustion errors without fallback
        throw error;
      }

      console.warn('StructuredLog:FallingBackToNodeJsEmbedding', {
        dockerError: error.message,
        text: text.substring(0, 100) + '...',
      });

      // Fall back to Node.js implementation
      const fallbackService = await this.getFallbackService();
      return fallbackService.embed(text);
    }
  }

  async embedDocument(document: Document): Promise<number[]> {
    // For simplicity, embedding document content directly.
    // In a more complex scenario, this might involve chunking and averaging/concatenating embeddings.
    // TODO: Migrate to use EmbeddingServiceManager for advanced chunking
    return this.embed(document.content);
  }
}
