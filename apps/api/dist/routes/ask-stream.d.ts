import { FastifyInstance } from 'fastify';
import { QdrantClient } from '../services/qdrant.js';
interface AskStreamRouteOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
    embeddingService: {
        embed(text: string): Promise<number[]>;
    };
}
export declare function askStreamRoute(fastify: FastifyInstance, options: AskStreamRouteOptions): Promise<void>;
export {};
