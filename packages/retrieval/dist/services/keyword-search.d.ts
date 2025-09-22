import { KeywordSearchResult } from '../types/hybrid.js';
export interface KeywordSearchService {
    search(collectionName: string, query: string, limit: number, filter?: Record<string, any>): Promise<KeywordSearchResult[]>;
}
interface QdrantClientInterface {
    scroll(collectionName: string, params: any): Promise<any>;
    discover(collectionName: string, params: any): Promise<any>;
}
export declare class QdrantKeywordSearchService implements KeywordSearchService {
    private qdrantClient;
    constructor(qdrantClient: QdrantClientInterface);
    search(collectionName: string, query: string, limit: number, filter?: Record<string, any>): Promise<KeywordSearchResult[]>;
    private buildFilterConditions;
    private calculateBM25Score;
}
export declare class QdrantSemanticKeywordSearchService implements KeywordSearchService {
    private qdrantClient;
    constructor(qdrantClient: QdrantClientInterface);
    search(collectionName: string, query: string, limit: number, filter?: Record<string, any>): Promise<KeywordSearchResult[]>;
}
export {};
