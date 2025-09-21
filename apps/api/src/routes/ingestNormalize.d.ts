import { FastifyInstance } from 'fastify';
import { QdrantClient } from '../services/qdrant.js';
import { EmbeddingService } from '@cw-rag-core/retrieval';
interface IngestNormalizeOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
    embeddingService: EmbeddingService;
}
export declare function ingestNormalizeRoute(fastify: FastifyInstance, options: IngestNormalizeOptions): Promise<void>;
export {};
