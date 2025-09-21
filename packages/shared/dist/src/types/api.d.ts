import { Document } from './document.js';
import { UserContext } from './user.js';
export type { DocumentMetadata, Document } from './document.js';
export interface IngestDocumentRequest {
    documents: Omit<Document, 'id'>[];
}
export interface IngestDocumentResponse {
    success: boolean;
    documentIds: string[];
    failedDocuments?: {
        document: Omit<Document, 'id'>;
        error: string;
    }[];
}
export interface RetrievalRequest {
    query: string;
    limit?: number;
    filter?: Record<string, any>;
}
export interface AskRequest {
    query: string;
    userContext: UserContext;
    k?: number;
    filter?: Record<string, any>;
}
export interface RetrievedDocument {
    document: Document;
    score: number;
}
export interface AskResponse {
    answer: string;
    retrievedDocuments: RetrievedDocument[];
    queryId: string;
}
//# sourceMappingURL=api.d.ts.map