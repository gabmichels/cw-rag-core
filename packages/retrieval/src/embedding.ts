import { Document } from '@cw-rag-core/shared';

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedDocument(document: Document): Promise<number[]>;
}

// Stub implementation for EmbeddingService
export class EmbeddingServiceStub implements EmbeddingService {
  async embed(text: string): Promise<number[]> {
    console.log(`Stub: Embedding text of length ${text.length}`);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 50));
    return Array.from({ length: 1536 }).map(() => Math.random()); // Common embedding dimension
  }

  async embedDocument(document: Document): Promise<number[]> {
    console.log(`Stub: Embedding document with ID ${document.id}`);
    return this.embed(document.content);
  }
}
