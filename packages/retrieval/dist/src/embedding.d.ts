import { Document } from '@cw-rag-core/shared';
export interface EmbeddingService {
    embed(text: string): Promise<number[]>;
    embedDocument(document: Document): Promise<number[]>;
}
export declare class BgeSmallEnV15EmbeddingService implements EmbeddingService {
    private fallbackService;
    private callEmbeddingService;
    private getFallbackService;
    embed(text: string): Promise<number[]>;
    embedDocument(document: Document): Promise<number[]>;
}
