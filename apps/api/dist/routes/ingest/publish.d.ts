import { FastifyInstance } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';
import { AuditLogger } from '../../utils/audit.js';
interface PublishRouteOptions {
    qdrantClient: QdrantClient;
    collectionName: string;
    auditLogger: AuditLogger;
}
export declare function publishRoute(fastify: FastifyInstance, options: PublishRouteOptions): Promise<void>;
export declare function createTokenAwareChunks(doc: any, maxTokensPerChunk: number): Promise<any[]>;
export {};
