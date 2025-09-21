export interface Vector {
  id: string;
  vector: number[];
  payload?: Record<string, any>; // Arbitrary metadata
  score?: number; // Similarity score, typically for search results
}

export interface VectorSearchParams {
  queryVector: number[];
  limit: number;
  filter?: Record<string, any>; // Metadata filter
}

export interface VectorSearchResult extends Vector {}

export interface VectorDBClient {
  upsertVectors(collectionName: string, vectors: Vector[]): Promise<void>;
  searchVectors(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]>;
}
