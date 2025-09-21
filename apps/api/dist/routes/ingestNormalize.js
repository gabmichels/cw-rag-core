import { ingestDocument } from '../services/qdrant.js';
import { IngestDocumentRequestSchema } from '@cw-rag-core/shared';
export async function ingestNormalizeRoute(fastify, options) {
    fastify.post('/ingest/normalize', {
        schema: {
            body: IngestDocumentRequestSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        documentIds: { type: 'array', items: { type: 'string' } },
                        failedDocuments: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    document: { type: 'object' }, // Simplified for stub
                                    error: { type: 'string' },
                                },
                                required: ['document', 'error'],
                            },
                        },
                    },
                    required: ['success', 'documentIds'],
                },
            },
        },
        handler: async (request, reply) => {
            const { documents } = request.body;
            const documentIds = [];
            const failedDocuments = [];
            for (const doc of documents) {
                try {
                    const id = await ingestDocument(options.qdrantClient, options.collectionName, doc);
                    documentIds.push(id);
                }
                catch (error) {
                    fastify.log.error(error.message, `Failed to ingest document: ${doc.metadata?.url || 'unknown'}`);
                    failedDocuments.push({ document: doc, error: error.message });
                }
            }
            const response = {
                success: failedDocuments.length === 0,
                documentIds,
                ...(failedDocuments.length > 0 && { failedDocuments }),
            };
            return reply.send(response);
        },
    });
}
