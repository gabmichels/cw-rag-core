import { z } from 'zod';
import { NormalizedDocSchema } from '@cw-rag-core/shared';
import { calculateDocumentHash, extractCombinedText, calculateDocumentSize, countBlocks, validateDocumentMetadata } from '../../utils/document.js';
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
const PreviewRequestSchema = z.union([
    NormalizedDocSchema,
    z.array(NormalizedDocSchema)
]);
const PreviewResponseSchema = z.object({
    wouldPublish: z.boolean(),
    findings: z.array(z.object({
        type: z.string(),
        count: z.number()
    })),
    bytes: z.number(),
    blocksCount: z.number(),
    processedDocs: z.number(),
    errors: z.array(z.string()).optional()
});
export async function previewRoute(fastify, options) {
    fastify.post('/preview', {
        schema: {
            body: PreviewRequestSchema,
            response: {
                200: PreviewResponseSchema,
            },
        },
        handler: async (request, reply) => {
            // Authentication is handled by parent route middleware
            try {
                const body = request.body;
                const docs = Array.isArray(body) ? body : [body];
                let totalBytes = 0;
                let totalBlocks = 0;
                let wouldPublish = true;
                const allFindings = [];
                const errors = [];
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
                            errors.push(`Document ${doc.meta.docId}: ${validationErrors.join(', ')}`);
                            continue;
                        }
                        // Calculate hash and update document
                        const calculatedHash = calculateDocumentHash(doc);
                        doc.meta.sha256 = calculatedHash;
                        // Extract text for PII detection
                        const combinedText = extractCombinedText(doc);
                        // Run PII detection
                        const redactionResult = policyEngine.applyRedaction(combinedText, defaultPolicy, doc.meta.path);
                        // Accumulate findings
                        for (const finding of redactionResult.redactions) {
                            const existing = allFindings.find(f => f.type === finding.type);
                            if (existing) {
                                existing.count += finding.count;
                            }
                            else {
                                allFindings.push({ ...finding });
                            }
                        }
                        // Check if this document would be blocked
                        if (redactionResult.blocked) {
                            wouldPublish = false;
                        }
                        // Calculate size and count blocks
                        totalBytes += calculateDocumentSize(doc);
                        totalBlocks += countBlocks(doc);
                        // Log preview operation
                        options.auditLogger.logPreview(doc.meta.tenant, doc.meta.docId, doc.meta.version, doc.meta.source, redactionResult.redactions, !redactionResult.blocked, request.ip || 'unknown', request.headers['user-agent']);
                    }
                    catch (docError) {
                        const errorMsg = `Error processing document ${doc.meta?.docId || 'unknown'}: ${docError.message}`;
                        errors.push(errorMsg);
                        fastify.log.error(errorMsg, docError);
                    }
                }
                const response = {
                    wouldPublish: wouldPublish && errors.length === 0,
                    findings: allFindings,
                    bytes: totalBytes,
                    blocksCount: totalBlocks,
                    processedDocs: docs.length,
                    ...(errors.length > 0 && { errors })
                };
                return reply.send(response);
            }
            catch (error) {
                fastify.log.error('Error in preview endpoint', error);
                return reply.status(500).send({
                    error: 'Internal Server Error',
                    message: 'Failed to process preview request'
                });
            }
        },
    });
}
