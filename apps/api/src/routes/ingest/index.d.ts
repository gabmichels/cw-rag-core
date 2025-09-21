import { FastifyInstance } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';
interface IngestRouteOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
    ingestToken: string;
}
export declare function ingestRoutes(fastify: FastifyInstance, options: IngestRouteOptions): Promise<void>;
export {};
