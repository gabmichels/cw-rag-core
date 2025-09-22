import { Vector } from './types/vector.js';

export interface QdrantClient {
  upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
  searchVectors(collectionName: string, queryVector: number[], limit: number, filter?: Record<string, any>): Promise<Vector[]>;
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
}
