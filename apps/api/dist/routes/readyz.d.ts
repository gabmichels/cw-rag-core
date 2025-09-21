import { FastifyInstance } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';
interface ReadyzOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
}
export declare function readyzRoute(fastify: FastifyInstance, options: ReadyzOptions): Promise<void>;
export {};
