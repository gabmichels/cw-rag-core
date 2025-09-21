import { FastifyRequest, FastifyReply } from 'fastify';
export interface AuthMiddlewareOptions {
    ingestToken: string;
}
/**
 * Authentication middleware for ingest endpoints
 * Validates x-ingest-token header against environment variable
 */
export declare function createAuthMiddleware(options: AuthMiddlewareOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
