import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { searchDocuments, QdrantClient } from '../services/qdrant.js';
import { AskRequest, AskResponse, RetrievedDocument, Document, UserContext, AskRequestSchema, AskResponseSchema, hasDocumentAccess } from '@cw-rag-core/shared';

interface AskRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
}

type AskRequestBody = FromSchema<typeof AskRequestSchema>;
type AskRouteRequest = FastifyRequest<{ Body: AskRequestBody }>;

export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  fastify.post('/ask', {
    schema: {
      body: AskRequestSchema,
      response: {
        200: AskResponseSchema,
      },
    },
    handler: async (request: any, reply: FastifyReply) => {
      const { query, userContext, k, filter } = request.body;

      // Extract tenant and ACLs from userContext for filtering
      const userTenants = [userContext.tenantId];
      const userAcl = [userContext.id, ...userContext.groupIds];

      // Perform vector search with RBAC pre-filtering (if applicable in Qdrant)
      // The searchDocuments function in qdrant.ts will handle the actual filtering logic
      const searchResultPoints = await searchDocuments(options.qdrantClient, options.collectionName, request.body, userTenants, userAcl);

      // Map Qdrant results to RetrievedDocument format and perform post-filtering if necessary
      const retrievedDocuments: RetrievedDocument[] = (searchResultPoints as any[]) // Cast to any[]
        .map(hit => ({
          document: {
            id: hit.id,
            content: hit.payload.content,
            metadata: {
              tenantId: hit.payload.tenant,
              docId: hit.payload.docId,
              acl: hit.payload.acl,
              lang: hit.payload.lang,
              url: hit.payload.url,
              ...(hit.payload.version && { version: hit.payload.version }),
              ...(hit.payload.filepath && { filepath: hit.payload.filepath }),
              ...(hit.payload.authors && { authors: hit.payload.authors }),
              ...(hit.payload.keywords && { keywords: hit.payload.keywords }),
            },
          },
          score: hit.score,
        }))
        .filter(doc => hasDocumentAccess(userContext, doc.document.metadata)); // RBAC post-filter

      // Phase-0 stub answer
      const answer = "Phase-0 stub answer: This is a placeholder response based on your query.";

      const response: AskResponse = {
        answer,
        retrievedDocuments,
        queryId: `qid-${Date.now()}`, // Generate a simple query ID
      };

      return reply.send(response);
    },
  });
}