import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from '@cw-rag-core/retrieval';
import type { FastifyBaseLogger } from 'fastify';
import { Document, RetrievalRequest, UserContext } from '@cw-rag-core/shared';
export { QdrantClient };
export declare const QDRANT_COLLECTION_NAME = "docs_v1";
export declare function bootstrapQdrant(qdrantClient: QdrantClient, logger: FastifyBaseLogger, maxRetries?: number, retryDelay?: number): Promise<void>;
export declare function ingestDocument(qdrantClient: QdrantClient, embeddingService: EmbeddingService, collectionName: string, document: Document, spaceId?: string, lexicalHints?: {
    coreTokens: string[];
    phrases: string[];
    language: string;
}): Promise<string>;
export declare function searchDocuments(qdrantClient: QdrantClient, collectionName: string, request: RetrievalRequest, userContext: UserContext, vector?: number[]): Promise<any[]>;
/**
 * Legacy compatibility function - maintains backward compatibility
 * @deprecated Use searchDocuments with UserContext instead
 */
export declare function searchDocumentsLegacy(qdrantClient: QdrantClient, collectionName: string, request: RetrievalRequest, userTenants: string[], userAcl: string[]): Promise<any[]>;
export declare function keywordSearchDocuments(qdrantClient: QdrantClient, collectionName: string, query: string, limit: number, userContext: UserContext): Promise<any[]>;
/**
 * Legacy compatibility function for keyword search
 * @deprecated Use keywordSearchDocuments with UserContext instead
 */
export declare function keywordSearchDocumentsLegacy(qdrantClient: QdrantClient, collectionName: string, query: string, limit: number, userTenants: string[], userAcl: string[]): Promise<any[]>;
/**
 * Performs a direct search for unauthorized access testing
 * Returns 0 results for users without proper ACL
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context (potentially unauthorized)
 * @param vector Search vector
 * @param limit Search limit
 * @returns Search results (empty for unauthorized users)
 */
export declare function securityTestSearch(qdrantClient: QdrantClient, collectionName: string, userContext: UserContext, vector: number[], limit?: number): Promise<any[]>;
/**
 * Optimized batch search for multiple queries with shared RBAC context
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context for RBAC
 * @param vectors Array of search vectors
 * @param limit Search limit per query
 * @returns Array of search results for each vector
 */
export declare function batchSearchDocuments(qdrantClient: QdrantClient, collectionName: string, userContext: UserContext, vectors: number[][], limit?: number): Promise<any[][]>;
/**
 * Optimized search with query hinting for better performance
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context for RBAC
 * @param vector Search vector
 * @param limit Search limit
 * @param exactSearch Whether to use exact search (true) or ANN search (false)
 * @returns Search results
 */
export declare function optimizedSearchDocuments(qdrantClient: QdrantClient, collectionName: string, userContext: UserContext, vector: number[], limit?: number, exactSearch?: boolean): Promise<any[]>;
