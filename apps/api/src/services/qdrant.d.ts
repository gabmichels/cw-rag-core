import { QdrantClient, PointStruct } from '@qdrant/js-client-rest';
import { EmbeddingService } from '@cw-rag-core/retrieval';
import { FastifyBaseLogger } from 'pino';
import { Document, RetrievalRequest } from '@cw-rag-core/shared';
export { QdrantClient } from '@qdrant/js-client-rest';
export declare const QDRANT_COLLECTION_NAME = "docs_v1";
export declare function bootstrapQdrant(qdrantClient: QdrantClient, logger: FastifyBaseLogger, maxRetries?: number, retryDelay?: number): Promise<void>;
export declare function ingestDocument(qdrantClient: QdrantClient, embeddingService: EmbeddingService, collectionName: string, document: Document): Promise<string>;
export declare function searchDocuments(qdrantClient: QdrantClient, collectionName: string, request: RetrievalRequest, userTenants: string[], userAcl: string[]): Promise<PointStruct[]>;
