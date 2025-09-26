import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ingestDocument, QdrantClient } from '../services/qdrant.js';
import { BgeSmallEnV15EmbeddingService, EmbeddingService } from '@cw-rag-core/retrieval';
import { IngestDocumentRequest, IngestDocumentResponse, Document, SpaceResolver } from '@cw-rag-core/shared';

interface IngestNormalizeOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  embeddingService: EmbeddingService;
}

export async function ingestNormalizeRoute(fastify: FastifyInstance, options: IngestNormalizeOptions) {
  fastify.post('/ingest/normalize', {
    schema: {
      body: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                metadata: {
                  type: 'object',
                  properties: {
                    tenantId: { type: 'string', format: 'uuid' },
                    docId: { type: 'string' },
                    version: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    filepath: { type: 'string' },
                    authors: { type: 'array', items: { type: 'string' } },
                    keywords: { type: 'array', items: { type: 'string' } },
                    acl: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['tenantId', 'docId', 'acl'],
                },
              },
              required: ['content', 'metadata'],
            },
          },
        },
        required: ['documents'],
      },
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
      const spaceResolver = new SpaceResolver();

      for (const doc of documents) {
        try {
          // Resolve space for the document
          const spaceResult = await spaceResolver.resolveSpace({
            tenantId: doc.metadata.tenantId,
            text: doc.content,
            source: 'api',
            owner: doc.metadata.authors?.[0] || 'system',
          });

          const id = await ingestDocument(
            options.qdrantClient,
            options.embeddingService,
            options.collectionName,
            doc as Document,
            spaceResult.spaceId,
            spaceResult.lexicalHints
          );
          documentIds.push(id);
        } catch (error) {
          fastify.log.error({ error }, `Failed to ingest document: ${doc.metadata?.url || 'unknown'}`);
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