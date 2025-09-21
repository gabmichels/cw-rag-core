import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthMiddlewareOptions {
  ingestToken: string;
}

/**
 * Authentication middleware for ingest endpoints
 * Validates x-ingest-token header against environment variable
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ingestToken = (request.headers as any)['x-ingest-token'];

    if (!ingestToken) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing x-ingest-token header'
      });
    }

    if (typeof ingestToken !== 'string' || ingestToken !== options.ingestToken) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid x-ingest-token'
      });
    }

    // Token is valid, continue to the route handler
  };
}