import { FastifyRequest, FastifyReply } from 'fastify';
export interface AuthMiddlewareOptions {
    ingestToken: string;
    logger?: any;
}
/**
 * Authentication middleware for ingest endpoints
 * Validates x-ingest-token header against environment variable
 * Uses timing-safe comparison to prevent timing attacks
 */
export declare function createAuthMiddleware(options: AuthMiddlewareOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
/**
 * Prevalidation hook for routes that require authentication
 * Can be used with fastify.addHook('preValidation', createAuthHook(options))
 */
export declare function createAuthHook(options: AuthMiddlewareOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
