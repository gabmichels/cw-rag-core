import { Document } from '@cw-rag-core/shared';

export interface IngestedDocument {
  document: Document;
  vector: number[]; // The embedding of the document content
}

export interface DocumentIngestionService {
  ingestDocument(document: Document): Promise<IngestedDocument>;
  // Potentially add batch ingestion or update methods
}
