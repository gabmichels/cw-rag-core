import { Document } from './document.js';
import { UserContext } from './user.js';
import { FreshnessInfo, FreshnessStats } from '../utils/freshness.js';
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
    freshness?: FreshnessInfo;
}
export interface AskResponse {
    answer: string;
    retrievedDocuments: RetrievedDocument[];
    queryId: string;
    guardrailDecision?: {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string;
        suggestions?: string[];
    };
    freshnessStats?: FreshnessStats;
    citations?: Array<{
        id: string;
        number: number;
        source: string;
        freshness?: FreshnessInfo;
    }>;
}
