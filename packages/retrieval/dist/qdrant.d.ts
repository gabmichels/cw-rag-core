import { Vector } from './types/vector.js';
export interface QdrantClient {
    upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
    searchVectors(collectionName: string, queryVector: number[], limit: number, filter?: Record<string, any>): Promise<Vector[]>;
}
export declare class QdrantClientStub implements QdrantClient {
    upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
    searchVectors(collectionName: string, queryVector: number[], limit: number, _filter?: Record<string, any>): Promise<Vector[]>;
}
