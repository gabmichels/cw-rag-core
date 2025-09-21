export interface Vector {
    id: string;
    vector: number[];
    payload?: Record<string, any>;
    score?: number;
}
export interface VectorSearchParams {
    queryVector: number[];
    limit: number;
    filter?: Record<string, any>;
}
export interface VectorSearchResult extends Vector {
}
export interface VectorDBClient {
    upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
    searchVectors(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]>;
}
//# sourceMappingURL=vector.d.ts.map