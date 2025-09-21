import { createAuditLogger } from '../../utils/audit.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import { previewRoute } from './preview.js';
import { publishRoute } from './publish.js';
import { uploadRoute } from './upload.js';
export async function ingestRoutes(fastify, options) {
    // Create audit logger
    const auditLogger = createAuditLogger(fastify.log);
    // Create centralized auth middleware
    const authMiddleware = createAuthMiddleware({
        ingestToken: options.ingestToken,
        logger: fastify.log
    });
    // Register specific rate limiting for /ingest/* routes (60 req/min as required)
    await fastify.register(require('@fastify/rate-limit'), {
        max: 60, // 60 requests per minute per IP for ingest endpoints
        timeWindow: '1 minute',
        keyGenerator: (request) => {
            // Rate limit by IP + tenant if available for better granularity
            const ip = request.ip || 'unknown';
            const tenant = request.headers['x-tenant'] || 'default';
            return `ingest:${ip}:${tenant}`;
        },
        errorResponseBuilder: (request, context) => {
            // Log rate limit exceeded for security monitoring
            fastify.log.warn('Ingest rate limit exceeded', {
                event: 'rate_limit_exceeded',
                type: 'ingest',
                ip: request.ip,
                endpoint: request.url,
                tenant: request.headers['x-tenant'],
                retryAfter: Math.round(context.ttl / 1000),
                timestamp: new Date().toISOString()
            });
            return {
                error: 'Rate Limit Exceeded',
                message: `Too many ingest requests. Limit: 60 requests per minute. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
                retryAfter: Math.round(context.ttl / 1000),
                code: 'INGEST_RATE_LIMIT_EXCEEDED'
            };
        },
        onExceeding: (request) => {
            fastify.log.warn('Ingest rate limit threshold reached', {
                ip: request.ip || 'unknown',
                endpoint: request.url,
                tenant: request.headers['x-tenant'],
                timestamp: new Date().toISOString()
            });
        }
    });
    // Apply authentication to all ingest routes
    fastify.addHook('preValidation', authMiddleware);
    // Helper function to handle preview logic (shared between preview and upload)
    const handlePreview = async (docs, request) => {
        // This would normally call the preview endpoint logic
        // For now, simplified implementation
        let totalBytes = 0;
        let totalBlocks = 0;
        const allFindings = [];
        for (const doc of docs) {
            totalBytes += JSON.stringify(doc).length;
            totalBlocks += doc.blocks?.length || 0;
        }
        return {
            wouldPublish: true,
            findings: allFindings,
            bytes: totalBytes,
            blocksCount: totalBlocks,
            processedDocs: docs.length
        };
    };
    // Helper function to handle publish logic (shared between publish and upload)
    const handlePublish = async (docs, request) => {
        // This would normally call the publish endpoint logic
        // For now, simplified implementation
        const results = docs.map(doc => ({
            docId: doc.meta?.docId || 'unknown',
            status: 'published',
            pointsUpserted: doc.blocks?.length || 1,
            findings: []
        }));
        const summary = {
            total: docs.length,
            published: docs.length,
            updated: 0,
            blocked: 0,
            deleted: 0,
            errors: 0
        };
        return { results, summary };
    };
    // Register individual route handlers (auth middleware is already applied above)
    await fastify.register(async function (fastify) {
        await previewRoute(fastify, {
            auditLogger
        });
    }, { prefix: '/ingest' });
    await fastify.register(async function (fastify) {
        await publishRoute(fastify, {
            qdrantClient: options.qdrantClient,
            collectionName: options.collectionName,
            auditLogger
        });
    }, { prefix: '/ingest' });
    await fastify.register(async function (fastify) {
        await uploadRoute(fastify, {
            auditLogger,
            previewHandler: handlePreview,
            publishHandler: handlePublish
        });
    }, { prefix: '/ingest' });
    // Add a general ingest info endpoint
    fastify.get('/ingest', async (request, reply) => {
        // Log authenticated access to info endpoint using structured logging
        fastify.log.info('Ingest API info endpoint accessed', {
            event: 'ingest_info_access',
            ip: request.ip || 'unknown',
            userAgent: request.headers['user-agent'] || 'unknown',
            timestamp: new Date().toISOString()
        });
        return reply.send({
            service: 'CW RAG Core Ingestion API',
            version: '1.0.0',
            endpoints: [
                {
                    path: '/ingest/preview',
                    method: 'POST',
                    description: 'Preview documents for ingestion without persisting',
                    rateLimit: '60 requests per minute per IP'
                },
                {
                    path: '/ingest/publish',
                    method: 'POST',
                    description: 'Publish documents to the vector database',
                    rateLimit: '60 requests per minute per IP'
                },
                {
                    path: '/ingest/upload',
                    method: 'POST',
                    description: 'Upload files for conversion and optional publishing',
                    rateLimit: '60 requests per minute per IP'
                }
            ],
            authentication: {
                type: 'x-ingest-token header',
                required: true,
                description: 'All ingest endpoints require valid x-ingest-token header'
            },
            security: {
                rateLimit: '60 requests per minute per IP',
                cors: 'Restricted to allowed origins only',
                headers: 'Security headers enforced'
            },
            supportedFileTypes: ['pdf', 'docx', 'md', 'html', 'txt'],
            maxFileSize: '10MB',
            timestamp: new Date().toISOString()
        });
    });
    fastify.log.info('Ingest routes registered with enhanced security', {
        features: [
            'Centralized authentication',
            '60 req/min rate limiting',
            'Structured logging',
            'Security monitoring'
        ],
        endpoints: ['/ingest', '/ingest/preview', '/ingest/publish', '/ingest/upload']
    });
}
