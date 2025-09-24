import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { QdrantClient } from '../services/qdrant.js';
import { DocumentMetadata } from '@cw-rag-core/shared';
// import { PointStruct } from '@qdrant/js-client-rest'; // PointStruct is not exported

// Define an interface for the chunk payload. This extends DocumentMetadata
// to ensure consistency while adding chunk-specific properties.
interface ChunkPayload extends DocumentMetadata {
  content: string;
  position?: number; // Assuming chunks might have a numerical position for ordering
  chunkIndex?: number; // Chunk index for proper document ordering
  sectionId?: string;
  title?: string;
  // Assuming start_index/end_index might be directly on the payload.
  // Adjust this based on actual ingestion schema if different.
  start_index?: number;
  end_index?: number;
  // Allow any other properties that might be present on the payload
  [key: string]: unknown;
}

interface DocumentFetchRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
}

export async function documentFetchRoute(fastify: FastifyInstance, options: DocumentFetchRouteOptions) {
  fastify.get('/documents/:docId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          docId: { type: 'string' }
        },
        required: ['docId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            docId: { type: 'string' },
            content: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                tenantId: { type: 'string' },
                docId: { type: 'string' },
                version: { type: 'string' },
                url: { type: 'string' },
                filepath: { type: 'string' },
                authors: { type: 'array', items: { type: 'string' } },
                keywords: { type: 'array', items: { type: 'string' } },
                acl: { type: 'array', items: { type: 'string' } },
                lang: { type: 'string' },
                createdAt: { type: 'string' },
                modifiedAt: { type: 'string' },
              },
              additionalProperties: true,
            },
            chunks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        content: { type: 'string' },
                        position: { type: 'number' },
                        sectionId: { type: 'string' },
                        title: { type: 'string' },
                        start_index: { type: 'number' },
                        end_index: { type: 'number' },
                        // Add any other relevant chunk metadata
                    },
                    additionalProperties: true,
                }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { docId } = request.params as { docId: string };

      try {
        // Fetch all chunks for the given docId
        const scrollResult = await options.qdrantClient.scroll(options.collectionName, {
          filter: {
            must: [
              {
                key: 'docId',
                match: {
                  value: docId,
                },
              },
            ],
          },
          limit: 1000, // Assuming a document won't have more than 1000 chunks
          with_payload: true,
          with_vector: false, // Corrected from with_vectors
        });

        if (!scrollResult || scrollResult.points.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Document with docId ${docId} not found or has no chunks.`,
          });
        }

        // Sort chunks by chunkIndex first, then by position, to ensure proper document order
        const sortedChunks = scrollResult.points
          .filter((point: { id: string | number; payload?: any }): point is { id: string | number; payload: ChunkPayload } =>
              point.payload?.content !== undefined && point.id !== undefined
          ) // Filter and type assertion for payload (ensures id and payload are present)
          .sort((a, b) => {
            const aPayload = a.payload as ChunkPayload;
            const bPayload = b.payload as ChunkPayload;

            // First, try sorting by chunkIndex if available
            const aChunkIndex = aPayload.chunkIndex;
            const bChunkIndex = bPayload.chunkIndex;

            if (typeof aChunkIndex === 'number' && typeof bChunkIndex === 'number') {
              return aChunkIndex - bChunkIndex;
            }

            // Fallback to position sorting
            const aPosition = aPayload.position || 0;
            const bPosition = bPayload.position || 0;

            if (aPosition !== bPosition) {
              return aPosition - bPosition;
            }

            // Final fallback: sort by chunk ID if it contains numeric information
            const aId = String(a.id);
            const bId = String(b.id);

            // Extract numeric parts from IDs for comparison
            const aNumMatch = aId.match(/(\d+)/);
            const bNumMatch = bId.match(/(\d+)/);

            if (aNumMatch && bNumMatch) {
              return parseInt(aNumMatch[0]) - parseInt(bNumMatch[0]);
            }

            // String comparison as last resort
            return aId.localeCompare(bId);
          });

        if (sortedChunks.length === 0) {
            return reply.status(404).send({
                error: 'Not Found',
                message: `Document with docId ${docId} found, but no reconstructible chunks.`,
            });
        }

        // Reconstruct the document content
        const reconstructedContent = sortedChunks
          .map(point => point.payload?.content)
          .join('\n\n'); // Join with double newline for readability

        // Extract metadata from the first chunk (assuming consistent and complete metadata on all chunks for the same docId)
        const firstChunkPayload = sortedChunks[0].payload as ChunkPayload; // Cast to our defined ChunkPayload
        const documentMetadata: DocumentMetadata = {
            ...firstChunkPayload, // Spread all properties from chunk payload first

            // Explicitly ensure required fields are correctly typed or provide fallbacks
            // Overwrite specific fields from payload with explicit type assertions for safety
            docId: (firstChunkPayload.docId as string) || docId,
            tenantId: (firstChunkPayload.tenantId as string) || 'unknown',
            acl: Array.isArray(firstChunkPayload.acl) ? (firstChunkPayload.acl as string[]) : [],
            authors: Array.isArray(firstChunkPayload.authors) ? (firstChunkPayload.authors as string[]) : undefined,
            keywords: Array.isArray(firstChunkPayload.keywords) ? (firstChunkPayload.keywords as string[]) : undefined,

            // Ensure optional string properties are indeed string | undefined
            version: firstChunkPayload.version as string | undefined,
            url: firstChunkPayload.url as string | undefined,
            filepath: firstChunkPayload.filepath as string | undefined,
            lang: firstChunkPayload.lang as string | undefined,
            createdAt: firstChunkPayload.createdAt as string | undefined,
            modifiedAt: firstChunkPayload.modifiedAt as string | undefined,
        };

        // Prepare chunk data for the response, including info needed for highlighting
        const chunkData = sortedChunks.map(point => {
            const payload = point.payload as ChunkPayload;
            return {
                id: point.id,
                content: payload.content,
                position: payload.position,
                sectionId: payload.sectionId,
                title: payload.title,
                start_index: payload.start_index, // Direct access after typing ChunkPayload
                end_index: payload.end_index,     // Direct access after typing ChunkPayload
            };
        });


        return reply.status(200).send({
          success: true,
          docId,
          content: reconstructedContent,
          metadata: documentMetadata,
          chunks: chunkData
        });

      } catch (error) {
        fastify.log.error(error, `Failed to fetch document ${docId}`);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve document content.',
        });
      }
    },
  });
}