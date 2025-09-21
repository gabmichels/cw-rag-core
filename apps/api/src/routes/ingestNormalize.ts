import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { ingestDocument, QdrantClient } from '../services/qdrant.js';
import { BgeSmallEnV15EmbeddingService, EmbeddingService } from '@cw-rag-core/retrieval';
import { IngestDocumentRequest, IngestDocumentResponse, Document, IngestDocumentRequestSchema } from '@cw-rag-core/shared';

interface IngestNormalizeOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  embeddingService: EmbeddingService;
}

type IngestNormalizeRequest = FastifyRequest<{
  Body: FromSchema<typeof IngestDocumentRequestSchema>;
}>;

export async function ingestNormalizeRoute(fastify: FastifyInstance, options: IngestNormalizeOptions) {
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
    handler: async (request: any, reply: FastifyReply) => {
      const { documents } = request.body;
      const documentIds: string[] = [];
      const failedDocuments: { document: Omit<Document, 'id'>; error: string }[] = [];

      for (const doc of documents) {
        try {
          const id = await ingestDocument(options.qdrantClient, options.embeddingService, options.collectionName, doc as Document);
          documentIds.push(id);
        } catch (error) {
          fastify.log.error((error as Error).message, `Failed to ingest document: ${doc.metadata?.url || 'unknown'}`);
          failedDocuments.push({ document: doc, error: (error as Error).message });
        }
      }

      const response: IngestDocumentResponse = {
        success: failedDocuments.length === 0,
        documentIds,
        ...(failedDocuments.length > 0 && { failedDocuments }),
      };

      return reply.send(response);
    },
  });
}