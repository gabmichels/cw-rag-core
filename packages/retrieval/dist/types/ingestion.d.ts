import { Document } from '@cw-rag-core/shared';
export interface IngestedDocument {
    document: Document;
    vector: number[];
}
export interface DocumentIngestionService {
    ingestDocument(document: Document): Promise<IngestedDocument>;
}
