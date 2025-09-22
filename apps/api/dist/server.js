import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { pino } from 'pino';
import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';
import { healthzRoute } from './routes/healthz.js';
import { readyzRoute } from './routes/readyz.js';
import { ingestNormalizeRoute } from './routes/ingestNormalize.js';
import { askRoute } from './routes/ask.js';
import { ingestRoutes } from './routes/ingest/index.js';
import { DOCUMENT_VECTOR_DIMENSION } from '@cw-rag-core/shared';
import { BgeSmallEnV15EmbeddingService } from '@cw-rag-core/retrieval';
const PORT = parseInt(process.env.PORT || '3000', 10);
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION_NAME = 'docs_v1';
const INGEST_TOKEN = process.env.INGEST_TOKEN;
// Security configuration
const ALLOWED_ORIGINS = [
    'http://localhost:3001', // Web frontend
    'http://localhost:5678' // N8N automation
];
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname',
        },
    } : undefined,
});
const qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
});
const embeddingService = new BgeSmallEnV15EmbeddingService();
async function bootstrapQdrant(maxRetries = 5, retryDelay = 5000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            logger.info(`Attempt ${i + 1} to connect to Qdrant and bootstrap collection...`);
            const collections = await qdrantClient.getCollections();
            const collectionExists = collections.collections.some((c) => c.name === QDRANT_COLLECTION_NAME);
            if (!collectionExists) {
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' not found, creating...`);
                await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
                    vectors: { size: DOCUMENT_VECTOR_DIMENSION, distance: 'Cosine' },
                });
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' created.`);
                logger.info(`Creating payload indexes for '${QDRANT_COLLECTION_NAME}'...`);
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'tenant', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'docId', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'acl', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'lang', field_schema: 'keyword', wait: true });
                logger.info('Payload indexes created successfully.');
            }
            else {
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' already exists.`);
            }
            logger.info('Qdrant bootstrap complete.');
            return;
        }
        catch (error) {
            logger.error(`Failed to connect to Qdrant or bootstrap collection: ${error.message}`);
            if (i < maxRetries - 1) {
                logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
            else {
                throw new Error('Max Qdrant connection retries reached. Exiting.');
            }
        }
    }
}
async function startServer() {
    const server = Fastify({
        logger: process.env.NODE_ENV === 'production' ? true : {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    ignore: 'pid,hostname',
                },
            },
        }
    });
    // Validate required environment variables
    if (!INGEST_TOKEN) {
        throw new Error('INGEST_TOKEN environment variable is required for security');
    }
    // Security headers middleware
    server.addHook('onSend', async (request, reply, payload) => {
        // Content Security Policy
        reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
        // Anti-clickjacking
        reply.header('X-Frame-Options', 'DENY');
        // Content type sniffing protection
        reply.header('X-Content-Type-Options', 'nosniff');
        // Referrer policy
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        // XSS protection (legacy but still useful)
        reply.header('X-XSS-Protection', '1; mode=block');
        // Rate limiting headers (if not already set by rate limiter)
        if (!reply.getHeader('X-RateLimit-Limit')) {
            reply.header('X-Rate-Limit-Policy', 'ingest: 60 requests per minute');
        }
        return payload;
    });
    // CORS configuration with allowlist
    await server.register(cors, {
        origin: (origin, callback) => {
            // Allow requests with no origin (like Postman, curl, etc.)
            if (!origin) {
                callback(null, true);
                return;
            }
            if (ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
                return;
            }
            // Log blocked origins for security monitoring
            logger.warn(`CORS request blocked from unauthorized origin: ${origin}`, {
                event: 'cors_blocked',
                origin,
                timestamp: new Date().toISOString()
            });
            callback(new Error('CORS: Origin not allowed'), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-ingest-token', 'x-tenant']
    });
    // Global rate limiting for all routes (basic protection)
    await server.register(rateLimit, {
        max: 1000, // 1000 requests per minute for general API usage
        timeWindow: '1 minute',
        keyGenerator: (request) => {
            return request.ip || 'unknown';
        },
        errorResponseBuilder: (request, context) => {
            logger.warn('Global rate limit exceeded', {
                event: 'rate_limit_exceeded',
                type: 'global',
                ip: request.ip,
                endpoint: request.url,
                timestamp: new Date().toISOString()
            });
            return {
                error: 'Rate Limit Exceeded',
                message: 'Too many requests. Please try again later.',
                retryAfter: Math.round(context.ttl / 1000),
                code: 'RATE_LIMIT_EXCEEDED'
            };
        }
    });
    // Register routes
    server.register(healthzRoute);
    server.register(readyzRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME });
    server.register(ingestNormalizeRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME, embeddingService });
    server.register(askRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME, embeddingService });
    server.register(ingestRoutes, {
        qdrantClient,
        collectionName: QDRANT_COLLECTION_NAME,
        ingestToken: INGEST_TOKEN
    });
    // Security event logging
    server.addHook('onRequest', async (request, reply) => {
        // Log ingest endpoint access attempts
        if (request.url?.startsWith('/ingest')) {
            logger.info('Ingest endpoint access attempt', {
                event: 'ingest_access_attempt',
                method: request.method,
                url: request.url,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
                hasToken: !!request.headers['x-ingest-token'],
                timestamp: new Date().toISOString()
            });
        }
    });
    // Error handling for security events
    server.setErrorHandler(async (error, request, reply) => {
        logger.error('Request processing error', {
            event: 'request_error',
            error: error.message,
            statusCode: error.statusCode || 500,
            method: request.method,
            url: request.url,
            ip: request.ip,
            timestamp: new Date().toISOString()
        });
        // Don't expose internal error details in production
        if (process.env.NODE_ENV === 'production') {
            reply.status(error.statusCode || 500).send({
                error: 'Internal Server Error',
                message: 'An error occurred processing your request',
                code: 'INTERNAL_ERROR'
            });
        }
        else {
            reply.status(error.statusCode || 500).send({
                error: error.name || 'Internal Server Error',
                message: error.message,
                code: error.code || 'INTERNAL_ERROR'
            });
        }
    });
    try {
        await bootstrapQdrant();
        await server.listen({ port: PORT, host: '0.0.0.0' });
        logger.info(`Secure server listening on http://0.0.0.0:${PORT}`, {
            event: 'server_started',
            port: PORT,
            corsOrigins: ALLOWED_ORIGINS,
            securityFeatures: [
                'CORS allowlist',
                'Rate limiting',
                'Security headers',
                'Token authentication',
                'Structured logging'
            ],
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        logger.error('Failed to start server', {
            event: 'server_startup_failed',
            error: err.message,
            stack: err.stack,
            name: err.name,
            timestamp: new Date().toISOString()
        });
        console.error('Full error details:', err);
        process.exit(1);
    }
}
startServer();
