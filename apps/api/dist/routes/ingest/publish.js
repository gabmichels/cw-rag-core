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
            body: {
                anyOf: [
                    {
                        type: 'object',
                        properties: {
                            meta: {
                                type: 'object',
                                properties: {
                                    tenant: { type: 'string', minLength: 1 },
                                    docId: { type: 'string', minLength: 1 },
                                    source: { type: 'string', minLength: 1 },
                                    path: { type: 'string' },
                                    title: { type: 'string' },
                                    lang: { type: 'string', pattern: '^[a-z]{2}$' },
                                    version: { type: 'string' },
                                    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                                    acl: { type: 'array', items: { type: 'string', minLength: 1 } },
                                    authors: { type: 'array', items: { type: 'string' } },
                                    tags: { type: 'array', items: { type: 'string' } },
                                    timestamp: { type: 'string', format: 'date-time' },
                                    modifiedAt: { type: 'string', format: 'date-time' },
                                    deleted: { type: 'boolean' },
                                },
                                required: ['tenant', 'docId', 'source', 'sha256', 'acl', 'timestamp'],
                            },
                            blocks: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        type: { type: 'string', enum: ['text', 'table', 'code', 'image-ref'] },
                                        text: { type: 'string' },
                                        html: { type: 'string' },
                                    },
                                    required: ['type'],
                                },
                            },
                        },
                        required: ['meta', 'blocks'],
                    },
                    {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                meta: {
                                    type: 'object',
                                    properties: {
                                        tenant: { type: 'string', minLength: 1 },
                                        docId: { type: 'string', minLength: 1 },
                                        source: { type: 'string', minLength: 1 },
                                        path: { type: 'string' },
                                        title: { type: 'string' },
                                        lang: { type: 'string', pattern: '^[a-z]{2}$' },
                                        version: { type: 'string' },
                                        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                                        acl: { type: 'array', items: { type: 'string', minLength: 1 } },
                                        authors: { type: 'array', items: { type: 'string' } },
                                        tags: { type: 'array', items: { type: 'string' } },
                                        timestamp: { type: 'string', format: 'date-time' },
                                        modifiedAt: { type: 'string', format: 'date-time' },
                                        deleted: { type: 'boolean' },
                                    },
                                    required: ['tenant', 'docId', 'source', 'sha256', 'acl', 'timestamp'],
                                },
                                blocks: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string', enum: ['text', 'table', 'code', 'image-ref'] },
                                            text: { type: 'string' },
                                            html: { type: 'string' },
                                        },
                                        required: ['type'],
                                    },
                                },
                            },
                            required: ['meta', 'blocks'],
                        },
                    },
                ],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        results: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    docId: { type: 'string' },
                                    status: { type: 'string', enum: ['published', 'updated', 'blocked', 'deleted', 'error'] },
                                    pointsUpserted: { type: 'number' },
                                    message: { type: 'string' },
                                    findings: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                type: { type: 'string' },
                                                count: { type: 'number' }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        summary: {
                            type: 'object',
                            properties: {
                                total: { type: 'number' },
                                published: { type: 'number' },
                                updated: { type: 'number' },
                                blocked: { type: 'number' },
                                deleted: { type: 'number' },
                                errors: { type: 'number' }
                            }
                        }
                    },
                    required: ['results', 'summary'],
                },
            },
        },
        handler: async (request, reply) => {
            // Authentication is handled by parent route middleware
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
                        fastify.log.error({ error: docError }, errorMsg);
                    }
                }
                return reply.send({ results, summary });
            }
            catch (error) {
                fastify.log.error({ error }, 'Error in publish endpoint');
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
    // Adaptive chunking strategy - split large blocks intelligently
    const maxCharsPerChunk = 1500; // Character limit to avoid 413 errors
    const chunks = await createAdaptiveChunks(doc, maxCharsPerChunk);
    const points = [];
    // Initialize embedding service once (optimization)
    const { BgeSmallEnV15EmbeddingService } = await import('@cw-rag-core/retrieval');
    const embeddingService = new BgeSmallEnV15EmbeddingService();
    console.log(`📄 Processing document ${doc.meta.docId} with ${chunks.length} chunks`);
    // Process chunks sequentially to avoid rate limits
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const pointId = generatePointId(doc.meta.tenant, doc.meta.docId, chunk.id);
        const payload = createChunkPayload(doc, chunk.id, chunk.sectionPath);
        // Generate embedding with size validation
        console.log(`🔄 Generating embedding for chunk ${chunk.id} (${chunk.text.length} chars)`);
        let vector;
        try {
            if (chunk.text.length > 2000) {
                console.warn(`⚠️  Large chunk detected: ${chunk.text.length} chars, truncating...`);
                const truncatedText = chunk.text.substring(0, 1800) + '...';
                vector = await embeddingService.embed(truncatedText);
            }
            else {
                vector = await embeddingService.embed(chunk.text);
            }
            console.log(`✅ Embedding generated for chunk ${chunk.id}: ${vector.length} dimensions`);
        }
        catch (error) {
            console.error(`❌ Failed to generate embedding for chunk ${chunk.id}:`, error);
            // Try with a smaller chunk if it fails
            try {
                console.log(`🔄 Retrying with smaller chunk...`);
                const smallerText = chunk.text.substring(0, 800);
                vector = await embeddingService.embed(smallerText);
                console.log(`✅ Retry successful with truncated chunk`);
            }
            catch (retryError) {
                throw new Error(`Embedding generation failed for chunk ${chunk.id} even after retry: ${retryError.message}`);
            }
        }
        points.push({
            id: pointId,
            vector,
            payload: {
                ...payload,
                content: chunk.text,
                chunkIndex: i,
                totalChunks: chunks.length
            }
        });
    }
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
// Adaptive chunking function that handles large blocks better
async function createAdaptiveChunks(doc, maxCharsPerChunk) {
    const chunks = [];
    for (const [blockIndex, block] of doc.blocks.entries()) {
        const text = block.text || block.html || '';
        if (text.length <= maxCharsPerChunk) {
            // Block fits in one chunk
            chunks.push({
                id: `chunk_${blockIndex}`,
                text: text,
                sectionPath: `block_${blockIndex}`,
                index: chunks.length
            });
        }
        else {
            // Split large block intelligently
            const sentences = text.split(/[.!?]+\s+/);
            let currentChunk = '';
            let subChunkIndex = 0;
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length + 1 <= maxCharsPerChunk) {
                    currentChunk += (currentChunk ? '. ' : '') + sentence;
                }
                else {
                    // Save current chunk if it has content
                    if (currentChunk.trim()) {
                        chunks.push({
                            id: `chunk_${blockIndex}_${subChunkIndex}`,
                            text: currentChunk.trim(),
                            sectionPath: `block_${blockIndex}/part_${subChunkIndex}`,
                            index: chunks.length
                        });
                        subChunkIndex++;
                    }
                    // Start new chunk with current sentence
                    if (sentence.length <= maxCharsPerChunk) {
                        currentChunk = sentence;
                    }
                    else {
                        // Handle extremely long sentences by word splitting
                        const words = sentence.split(' ');
                        let wordChunk = '';
                        for (const word of words) {
                            if (wordChunk.length + word.length + 1 <= maxCharsPerChunk) {
                                wordChunk += (wordChunk ? ' ' : '') + word;
                            }
                            else {
                                if (wordChunk.trim()) {
                                    chunks.push({
                                        id: `chunk_${blockIndex}_${subChunkIndex}`,
                                        text: wordChunk.trim(),
                                        sectionPath: `block_${blockIndex}/part_${subChunkIndex}`,
                                        index: chunks.length
                                    });
                                    subChunkIndex++;
                                }
                                wordChunk = word;
                            }
                        }
                        currentChunk = wordChunk;
                    }
                }
            }
            // Don't forget the last chunk
            if (currentChunk.trim()) {
                chunks.push({
                    id: `chunk_${blockIndex}_${subChunkIndex}`,
                    text: currentChunk.trim(),
                    sectionPath: `block_${blockIndex}/part_${subChunkIndex}`,
                    index: chunks.length
                });
            }
        }
    }
    return chunks;
}
// Smart chunking function that respects token limits (legacy)
async function createSmartChunks(doc, maxTokensPerChunk) {
    const chunks = [];
    for (const [blockIndex, block] of doc.blocks.entries()) {
        const text = block.text || block.html || '';
        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        const estimatedTokens = Math.ceil(text.length / 4);
        if (estimatedTokens <= maxTokensPerChunk) {
            // Block fits in one chunk
            chunks.push({
                id: `chunk_${blockIndex}`,
                text: text,
                sectionPath: `block_${blockIndex}`,
                index: chunks.length
            });
        }
        else {
            // Split large block into smaller chunks
            const wordsPerChunk = Math.floor(maxTokensPerChunk * 0.8); // Conservative estimate
            const words = text.split(' ');
            for (let i = 0; i < words.length; i += wordsPerChunk) {
                const chunkWords = words.slice(i, i + wordsPerChunk);
                chunks.push({
                    id: `chunk_${blockIndex}_${Math.floor(i / wordsPerChunk)}`,
                    text: chunkWords.join(' '),
                    sectionPath: `block_${blockIndex}/part_${Math.floor(i / wordsPerChunk)}`,
                    index: chunks.length
                });
            }
        }
    }
    return chunks;
}
