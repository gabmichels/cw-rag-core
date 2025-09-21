declare module '@qdrant/js-client-rest' {
    export interface CollectionInfo {
        status: 'green' | 'yellow' | 'red';
        vectors_count: number;
    }

    export interface PointStruct {
        id: string | number;
        vector: number[];
        payload?: Record<string, any>;
    }

    export interface ScoredPoint {
        id: string | number;
        version: number;
        score: number;
        payload?: Record<string, any>;
        vector?: number[];
    }

    export interface SearchParams {
        vector: number[];
        query?: string; // Allow general query string for now, to enable `q: request.query`
        limit: number;
        filter?: Record<string, any>; // Define filter type more specifically if needed
        with_payload?: boolean;
        offset?: number;
        score_threshold?: number;
    }

    export interface CreateCollection {
        vectors: {
          size: number;
          distance: 'Cosine' | 'Euclid' | 'Dot';
        };
        shard_number?: number;
        replication_factor?: number;
        write_consistency_factor?: number;
        on_disk_payload?: boolean;
    }

    export interface PayloadIndex {
        field_name: string;
        field_schema: 'keyword' | 'integer' | 'float' | 'geo' | 'text' | 'bool';
        wait?: boolean;
    }

    export interface UpsertPoints {
      wait?: boolean;
      batch: {
        ids: (string | number)[];
        vectors: number[][];
        payloads: (Record<string, any> | null)[];
      };
    }

    export class QdrantClient {
        constructor(options: { host: string; apiKey?: string });
        getCollections(): Promise<{ collections: { name: string; points_count?: number }[] }>;
        createCollection(collectionName: string, config: CreateCollection): Promise<any>;
        createPayloadIndex(collectionName: string, config: PayloadIndex): Promise<any>;
        upsert(collectionName: string, points: UpsertPoints): Promise<any>;
        search(collectionName: string, params: SearchParams): Promise<ScoredPoint[]>;
    }
}