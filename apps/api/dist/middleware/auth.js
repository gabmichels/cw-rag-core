/**
 * Authentication middleware for ingest endpoints
 * Validates x-ingest-token header against environment variable
 */
export function createAuthMiddleware(options) {
    return async (request, reply) => {
        const ingestToken = request.headers['x-ingest-token'];
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
