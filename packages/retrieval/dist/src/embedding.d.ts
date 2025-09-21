import { Document } from '@cw-rag-core/shared';
export interface EmbeddingService {
    embed(text: string): Promise<number[]>;
    embedDocument(document: Document): Promise<number[]>;
}
export declare class EmbeddingServiceStub implements EmbeddingService {
    embed(text: string): Promise<number[]>;
    embedDocument(document: Document): Promise<number[]>;
}
//# sourceMappingURL=embedding.d.ts.map