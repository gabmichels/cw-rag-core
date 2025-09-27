import { Vector } from './types/vector.js';

export interface QdrantScrollOptions {
  filter?: Record<string, any>;
  limit?: number;
  with_payload?: boolean;
  with_vector?: boolean;
  offset?: string;
}

export interface QdrantScrollResult {
  points: Array<{
    id: string | number;
    payload?: Record<string, any>;
    vector?: number[];
  }>;
  next_page_offset?: string;
}

export interface QdrantClient {
  upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
  searchVectors(collectionName: string, queryVector: number[], limit: number, filter?: Record<string, any>): Promise<Vector[]>;
  scroll(collectionName: string, options?: QdrantScrollOptions): Promise<QdrantScrollResult>;
  // Placeholder for other Qdrant operations
}

// Stub implementation for QdrantClient
export class QdrantClientStub implements QdrantClient {
  async upsertVectors(collectionName: string, vectors: Vector[]): Promise<void> {
    console.log(`Stub: Upserting ${vectors.length} vectors into collection ${collectionName}`);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async searchVectors(collectionName: string, queryVector: number[], limit: number, _filter?: Record<string, any>): Promise<Vector[]> {
    console.log(`Stub: Searching collection ${collectionName} with query vector (first 5 elements): [${queryVector.slice(0, 5).join(', ')}...]`);
    // Simulate async operation and return mock results
    await new Promise(resolve => setTimeout(resolve, 100));
    return Array.from({ length: limit }).map((_, i) => ({
      id: `mock-vector-${i}`,
      vector: Array.from({ length: queryVector.length }).map(() => Math.random()),
      payload: { docId: `mock-doc-${i}`, tenantId: 'mock-tenant' },
      score: Math.random(),
    }));
  }

  async scroll(collectionName: string, options?: QdrantScrollOptions): Promise<QdrantScrollResult> {
    console.log(`Stub: Scrolling collection ${collectionName} with options:`, options);
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Extract tenant from collection name (format: {tenantId}_collection)
    const tenantId = collectionName.replace('_collection', '');
    const limit = options?.limit || 10;
    return {
      points: Array.from({ length: limit }).map((_, i) => ({
        id: `mock-point-${i}`,
        payload: {
          content: `Mock content ${i} for ${tenantId}`,
          docId: `mock-doc-${i}`,
          tenantId: tenantId
        },
        vector: options?.with_vector ? Array.from({ length: 768 }).map(() => Math.random()) : undefined,
      })),
      next_page_offset: undefined,
    };
  }
}
