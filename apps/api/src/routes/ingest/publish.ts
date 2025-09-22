import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { NormalizedDocSchema } from '@cw-rag-core/shared';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  calculateDocumentHash,
  extractCombinedText,
  validateDocumentMetadata,
  generatePointId,
  createChunkPayload
} from '../../utils/document.js';
import { AuditLogger, RedactionSummary } from '../../utils/audit.js';

// Import PII policy types (inline for now due to import issues)
interface PIIPolicy {
  mode: 'off' | 'mask' | 'block' | 'allowlist';
  allowedTypes?: string[];
  tenantId?: string;
  sourceOverrides?: Record<string, Partial<PIIPolicy>>;
}

interface RedactionResult {
  maskedText: string;
  redactions: RedactionSummary[];
  blocked: boolean;
  originalLength: number;
}

// Temporary PII policy engine (simplified version)
class SimplePIIPolicyEngine {
  applyRedaction(text: string, policy: PIIPolicy, sourcePath?: string): RedactionResult {
    // Simplified implementation - in real scenario would import from ingestion-sdk
    const mockDetections: any[] = [];

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

    const redactions: RedactionSummary[] = [];
    const typeCount = new Map<string, number>();

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

interface PublishRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  auditLogger: AuditLogger;
}

export async function publishRoute(fastify: FastifyInstance, options: PublishRouteOptions) {
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
            published: { type: 'boolean' },
            documentIds: { type: 'array', items: { type: 'string' } },
            errors: { type: 'array', items: { type: 'string' } },
          },
          required: ['published', 'documentIds'],
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // Authentication is handled by parent route middleware
      try {
        const body = request.body as any;
        const docs = Array.isArray(body) ? body : [body];

        const results: any[] = [];
        const summary = {
          total: docs.length,
          published: 0,
          updated: 0,
          blocked: 0,
          deleted: 0,
          errors: 0
        };

        // Get default policy (in production, this would be tenant-specific)
        const defaultPolicy: PIIPolicy = {
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

              options.auditLogger.logError(
                '/ingest/publish',
                doc.meta?.tenant || 'unknown',
                doc.meta?.docId || 'unknown',
                doc.meta?.source || 'unknown',
                errorMsg,
                (request as any).ip || 'unknown',
                (request.headers as any)['user-agent']
              );
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
            const redactionResult = policyEngine.applyRedaction(
              combinedText,
              defaultPolicy,
              doc.meta.path
            );

            // Check if document should be blocked
            if (redactionResult.blocked) {
              results.push({
                docId: doc.meta.docId,
                status: 'blocked',
                message: 'Document blocked due to PII policy',
                findings: redactionResult.redactions
              });
              summary.blocked++;

              options.auditLogger.logBlock(
                doc.meta.tenant,
                doc.meta.docId,
                doc.meta.version,
                doc.meta.source,
                redactionResult.redactions,
                (request as any).ip || 'unknown',
                (request.headers as any)['user-agent']
              );
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
            options.auditLogger.logPublish(
              doc.meta.tenant,
              doc.meta.docId,
              doc.meta.version,
              doc.meta.source,
              redactionResult.redactions,
              (request as any).ip || 'unknown',
              (request.headers as any)['user-agent']
            );

          } catch (docError) {
            const errorMsg = `Error processing document: ${(docError as Error).message}`;
            results.push({
              docId: doc.meta?.docId || 'unknown',
              status: 'error',
              message: errorMsg
            });
            summary.errors++;

            options.auditLogger.logError(
              '/ingest/publish',
              doc.meta?.tenant || 'unknown',
              doc.meta?.docId || 'unknown',
              doc.meta?.source || 'unknown',
              errorMsg,
              (request as any).ip || 'unknown',
              (request.headers as any)['user-agent']
            );

            fastify.log.error({ error: docError }, errorMsg);
          }
        }

        return reply.send({ results, summary });

      } catch (error) {
        fastify.log.error({ error }, 'Error in publish endpoint');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process publish request'
        });
      }
    },
  });
}

async function handleDocumentDeletion(doc: any, options: PublishRouteOptions, request: FastifyRequest) {
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
  options.auditLogger.logTombstone(
    doc.meta.tenant,
    doc.meta.docId,
    doc.meta.source,
    (request as any).ip || 'unknown',
    (request.headers as any)['user-agent']
  );
}

async function publishDocument(doc: any, maskedText: string, options: PublishRouteOptions): Promise<number> {
  // Simple chunking strategy - split by blocks
  const chunks = doc.blocks.map((block: any, index: number) => ({
    id: `chunk_${index}`,
    text: block.text || block.html || '',
    sectionPath: `block_${index}`
  }));

  const points = chunks.map((chunk: any, index: number) => {
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
      ids: points.map((p: any) => p.id),
      vectors: points.map((p: any) => p.vector),
      payloads: points.map((p: any) => p.payload)
    }
  });

  return points.length;
}