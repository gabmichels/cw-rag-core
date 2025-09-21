import { FastifyInstance } from 'fastify';
import { QdrantClient } from '../services/qdrant.js';
interface IngestNormalizeOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
}
export declare function ingestNormalizeRoute(fastify: FastifyInstance, options: IngestNormalizeOptions): Promise<void>;
export {};
