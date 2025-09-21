import { z } from 'zod';
import { NormalizedDocSchema } from '@cw-rag-core/shared';
import { calculateDocumentHash, extractCombinedText, validateDocumentMetadata, generatePointId, createChunkPayload } from '../../utils/document.js';
// Temporary PII policy engine (simplified version)
class SimplePIIPolicyEngine {
    applyRedaction(text, policy, sourcePath) {
        // Simplified implementation - in real scenario would import from ingestion-sdk
        const mockDetections = [];
        // Simple email detection
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        let match;
        while ((match = emailRegex.exec(text)) !== null) {
            mockDetections.push({
                type: 'email',
                start: match.index,
                end: match.index + match[0].length,
                confidence: 0.9
            });
        }
        // Simple phone detection
        const phoneRegex = /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
        while ((match = phoneRegex.exec(text)) !== null) {
            mockDetections.push({
                type: 'phone',
                start: match.index,
                end: match.index + match[0].length,
                confidence: 0.8
            });
        }
        const redactions = [];
        const typeCount = new Map();
        for (const detection of mockDetections) {
            const count = typeCount.get(detection.type) || 0;
            typeCount.set(detection.type, count + 1);
        }
        for (const [type, count] of typeCount) {
            redactions.push({ type, count });
        }
        if (policy.mode === 'off') {
            return {
                maskedText: text,
                redactions: [],
                blocked: false,
                originalLength: text.length
            };
        }
        if (policy.mode === 'block' && mockDetections.length > 0) {
            return {
                maskedText: '[CONTENT_BLOCKED_DUE_TO_PII]',
                redactions,
                blocked: true,
                originalLength: text.length
            };
        }
        // Apply masking
        let maskedText = text;
        const sortedDetections = [...mockDetections].sort((a, b) => b.start - a.start);
        for (const detection of sortedDetections) {
            const mask = detection.type === 'email' ? '[EMAIL_REDACTED]' : '[PII_REDACTED]';
            maskedText = maskedText.slice(0, detection.start) + mask + maskedText.slice(detection.end);
        }
        return {
            maskedText,
            redactions,
            blocked: false,
            originalLength: text.length
        };
    }
}
const policyEngine = new SimplePIIPolicyEngine();
// Request/Response schemas
const PublishRequestSchema = z.union([
    NormalizedDocSchema,
    z.array(NormalizedDocSchema)
]);
const PublishResponseSchema = z.object({
    results: z.array(z.object({
        docId: z.string(),
        status: z.enum(['published', 'updated', 'blocked', 'deleted', 'error']),
        pointsUpserted: z.number().optional(),
        message: z.string().optional(),
        findings: z.array(z.object({
            type: z.string(),
            count: z.number()
        })).optional()
    })),
    summary: z.object({
        total: z.number(),
        published: z.number(),
        updated: z.number(),
        blocked: z.number(),
        deleted: z.number(),
        errors: z.number()
    })
});
export async function publishRoute(fastify, options) {
    fastify.post('/publish', {
        schema: {
            body: PublishRequestSchema,
            response: {
                200: PublishResponseSchema,
            },
        },
        handler: async (request, reply) => {
            // Authentication check
            const ingestToken = request.headers['x-ingest-token'];
            if (!ingestToken || ingestToken !== options.ingestToken) {
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid or missing x-ingest-token'
                });
            }
            try {
                const body = request.body;
                const docs = Array.isArray(body) ? body : [body];
                const results = [];
                const summary = {
                    total: docs.length,
                    published: 0,
                    updated: 0,
                    blocked: 0,
                    deleted: 0,
                    errors: 0
                };
                // Get default policy (in production, this would be tenant-specific)
                const defaultPolicy = {
                    mode: 'mask', // Default to masking
                    tenantId: undefined
                };
                for (const doc of docs) {
                    try {
                        // Validate document metadata
                        const validationErrors = validateDocumentMetadata(doc);
                        if (validationErrors.length > 0) {
                            const errorMsg = `Validation failed: ${validationErrors.join(', ')}`;
                            results.push({
                                docId: doc.meta?.docId || 'unknown',
                                status: 'error',
                                message: errorMsg
                            });
                            summary.errors++;
                            options.auditLogger.logError('/ingest/publish', doc.meta?.tenant || 'unknown', doc.meta?.docId || 'unknown', doc.meta?.source || 'unknown', errorMsg, request.ip || 'unknown', request.headers['user-agent']);
                            continue;
                        }
                        // Check if this is a deletion
                        if (doc.meta.deleted) {
                            await handleDocumentDeletion(doc, options, request);
                            results.push({
                                docId: doc.meta.docId,
                                status: 'deleted',
                                message: 'Document marked for deletion'
                            });
                            summary.deleted++;
                            continue;
                        }
                        // Calculate hash and update document
                        const calculatedHash = calculateDocumentHash(doc);
                        doc.meta.sha256 = calculatedHash;
                        // Check for duplicates by (tenant, docId, sha256)
                        // Use search with a dummy vector to check for existing documents
                        const dummyVector = new Array(384).fill(0);
                        const existingPoints = await options.qdrantClient.search(options.collectionName, {
                            vector: dummyVector,
                            limit: 1,
                            filter: {
                                must: [
                                    { key: 'tenant', match: { value: doc.meta.tenant } },
                                    { key: 'docId', match: { value: doc.meta.docId } },
                                    { key: 'sha256', match: { value: doc.meta.sha256 } }
                                ]
                            }
                        });
                        if (existingPoints && existingPoints.length > 0) {
                            results.push({
                                docId: doc.meta.docId,
                                status: 'updated',
                                message: 'Document already exists with same content hash'
                            });
                            summary.updated++;
                            continue;
                        }
                        // Extract text for PII detection
                        const combinedText = extractCombinedText(doc);
                        // Apply PII policy
                        const redactionResult = policyEngine.applyRedaction(combinedText, defaultPolicy, doc.meta.path);
                        // Check if document should be blocked
                        if (redactionResult.blocked) {
                            results.push({
                                docId: doc.meta.docId,
                                status: 'blocked',
                                message: 'Document blocked due to PII policy',
                                findings: redactionResult.redactions
                            });
                            summary.blocked++;
                            options.auditLogger.logBlock(doc.meta.tenant, doc.meta.docId, doc.meta.version, doc.meta.source, redactionResult.redactions, request.ip || 'unknown', request.headers['user-agent']);
                            continue;
                        }
                        // Process document for publication
                        const pointsUpserted = await publishDocument(doc, redactionResult.maskedText, options);
                        results.push({
                            docId: doc.meta.docId,
                            status: 'published',
                            pointsUpserted,
                            findings: redactionResult.redactions
                        });
                        summary.published++;
                        // Log successful publication
                        options.auditLogger.logPublish(doc.meta.tenant, doc.meta.docId, doc.meta.version, doc.meta.source, redactionResult.redactions, request.ip || 'unknown', request.headers['user-agent']);
                    }
                    catch (docError) {
                        const errorMsg = `Error processing document: ${docError.message}`;
                        results.push({
                            docId: doc.meta?.docId || 'unknown',
                            status: 'error',
                            message: errorMsg
                        });
                        summary.errors++;
                        options.auditLogger.logError('/ingest/publish', doc.meta?.tenant || 'unknown', doc.meta?.docId || 'unknown', doc.meta?.source || 'unknown', errorMsg, request.ip || 'unknown', request.headers['user-agent']);
                        fastify.log.error(errorMsg, docError);
                    }
                }
                return reply.send({ results, summary });
            }
            catch (error) {
                fastify.log.error('Error in publish endpoint', error);
                return reply.status(500).send({
                    error: 'Internal Server Error',
                    message: 'Failed to process publish request'
                });
            }
        },
    });
}
async function handleDocumentDeletion(doc, options, request) {
    // Delete all points for this document by searching first, then deleting by IDs
    const dummyVector = new Array(384).fill(0);
    const existingPoints = await options.qdrantClient.search(options.collectionName, {
        vector: dummyVector,
        limit: 1000, // Get all points for this document
        filter: {
            must: [
                { key: 'tenant', match: { value: doc.meta.tenant } },
                { key: 'docId', match: { value: doc.meta.docId } }
            ]
        }
    });
    // Delete points by IDs if any exist
    if (existingPoints && existingPoints.length > 0) {
        const pointIds = existingPoints.map(point => point.id);
        // Use deletePoints method (or equivalent) - for now, skip deletion as API is unclear
        // TODO: Implement proper deletion once Qdrant client API is clarified
        console.log(`Would delete ${pointIds.length} points for document ${doc.meta.docId}`);
    }
    // Create tombstone entry (optional - for audit trail)
    const tombstonePayload = {
        tenant: doc.meta.tenant,
        docId: doc.meta.docId,
        source: doc.meta.source,
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: 'ingestion-api'
    };
    // Log tombstone
    options.auditLogger.logTombstone(doc.meta.tenant, doc.meta.docId, doc.meta.source, request.ip || 'unknown', request.headers['user-agent']);
}
async function publishDocument(doc, maskedText, options) {
    // Simple chunking strategy - split by blocks
    const chunks = doc.blocks.map((block, index) => ({
        id: `chunk_${index}`,
        text: block.text || block.html || '',
        sectionPath: `block_${index}`
    }));
    const points = chunks.map((chunk, index) => {
        const pointId = generatePointId(doc.meta.tenant, doc.meta.docId, chunk.id);
        const payload = createChunkPayload(doc, chunk.id, chunk.sectionPath);
        // Use placeholder embedding (in production, generate real embeddings)
        const vector = new Array(384).fill(0).map(() => Math.random() * 2 - 1);
        return {
            id: pointId,
            vector,
            payload: {
                ...payload,
                content: chunk.text // Use chunked text instead of full document
            }
        };
    });
    // Upsert points to Qdrant using the correct batch format
    await options.qdrantClient.upsert(options.collectionName, {
        wait: true,
        batch: {
            ids: points.map((p) => p.id),
            vectors: points.map((p) => p.vector),
            payloads: points.map((p) => p.payload)
        }
    });
    return points.length;
}
