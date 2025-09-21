import crypto from 'crypto';
/**
 * Authentication middleware for ingest endpoints
 * Validates x-ingest-token header against environment variable
 * Uses timing-safe comparison to prevent timing attacks
 */
export function createAuthMiddleware(options) {
    return async (request, reply) => {
        const startTime = Date.now();
        const clientIp = request.ip || 'unknown';
        const userAgent = request.headers['user-agent'] || 'unknown';
        const endpoint = request.url || 'unknown';
        try {
            const ingestToken = request.headers['x-ingest-token'];
            if (!ingestToken) {
                // Log authentication failure
                if (options.logger) {
                    options.logger.warn({
                        event: 'auth_failure',
                        reason: 'missing_token',
                        endpoint,
                        clientIp,
                        userAgent,
                        timestamp: new Date().toISOString()
                    }, 'Authentication failed: Missing x-ingest-token header');
                }
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Missing x-ingest-token header',
                    code: 'MISSING_TOKEN'
                });
            }
            if (typeof ingestToken !== 'string') {
                // Log authentication failure
                if (options.logger) {
                    options.logger.warn({
                        event: 'auth_failure',
                        reason: 'invalid_token_type',
                        endpoint,
                        clientIp,
                        userAgent,
                        timestamp: new Date().toISOString()
                    }, 'Authentication failed: Invalid token type');
                }
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid x-ingest-token format',
                    code: 'INVALID_TOKEN_FORMAT'
                });
            }
            // Use timing-safe comparison to prevent timing attacks
            const providedTokenBuffer = Buffer.from(ingestToken, 'utf8');
            const expectedTokenBuffer = Buffer.from(options.ingestToken, 'utf8');
            let isValid = false;
            if (providedTokenBuffer.length === expectedTokenBuffer.length) {
                isValid = crypto.timingSafeEqual(providedTokenBuffer, expectedTokenBuffer);
            }
            if (!isValid) {
                // Log authentication failure
                if (options.logger) {
                    options.logger.warn({
                        event: 'auth_failure',
                        reason: 'invalid_token',
                        endpoint,
                        clientIp,
                        userAgent,
                        tokenLength: providedTokenBuffer.length,
                        timestamp: new Date().toISOString()
                    }, 'Authentication failed: Invalid x-ingest-token');
                }
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid x-ingest-token',
                    code: 'INVALID_TOKEN'
                });
            }
            // Log successful authentication
            const authTime = Date.now() - startTime;
            if (options.logger) {
                options.logger.info({
                    event: 'auth_success',
                    endpoint,
                    clientIp,
                    userAgent,
                    authTimeMs: authTime,
                    timestamp: new Date().toISOString()
                }, 'Authentication successful');
            }
            // Token is valid, continue to the route handler
        }
        catch (error) {
            // Log authentication error
            if (options.logger) {
                options.logger.error({
                    event: 'auth_error',
                    error: error.message,
                    endpoint,
                    clientIp,
                    userAgent,
                    timestamp: new Date().toISOString()
                }, 'Authentication error occurred');
            }
            return reply.status(500).send({
                error: 'Internal Server Error',
                message: 'Authentication processing failed',
                code: 'AUTH_ERROR'
            });
        }
    };
}
/**
 * Prevalidation hook for routes that require authentication
 * Can be used with fastify.addHook('preValidation', createAuthHook(options))
 */
export function createAuthHook(options) {
    return createAuthMiddleware(options);
}
