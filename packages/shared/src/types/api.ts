import { DocumentMetadata, Document } from './document.js';
import { UserContext } from './user.js';

// Ingest API types
export interface IngestDocumentRequest {
  documents: Omit<Document, 'id'>[];
}

export interface IngestDocumentResponse {
  success: boolean;
  documentIds: string[];
  failedDocuments?: { document: Omit<Document, 'id'>; error: string }[];
}

// Retrieval types
export interface RetrievalRequest {
  query: string;
  limit?: number;
  filter?: Record<string, any>;
}

// Ask API types
export interface AskRequest {
  query: string;
  userContext: UserContext;
  k?: number; // Number of documents to retrieve
  filter?: Record<string, any>; // Metadata filter for RAG
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
