import { FastifyInstance } from 'fastify';
import { QdrantClient } from '../services/qdrant.js';
interface AskRouteOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
}
export declare function askRoute(fastify: FastifyInstance, options: AskRouteOptions): Promise<void>;
export {};
