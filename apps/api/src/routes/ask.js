import { searchDocuments } from '../services/qdrant.js';
import { AskRequestSchema, AskResponseSchema, hasDocumentAccess } from '@cw-rag-core/shared';
export async function askRoute(fastify, options) {
    fastify.post('/ask', {
        // Temporarily disable schema validation to get server running
        // TODO: Convert Zod schemas to JSON Schema format
        handler: async (request, reply) => {
            const { query, userContext, k, filter } = request.body;
            // Extract tenant and ACLs from userContext for filtering
            const userTenants = [userContext.tenantId];
            const userAcl = [userContext.id, ...userContext.groupIds];
            // Perform vector search with RBAC pre-filtering (if applicable in Qdrant)
            // The searchDocuments function in qdrant.ts will handle the actual filtering logic
            const searchResultPoints = await searchDocuments(options.qdrantClient, options.collectionName, request.body, userTenants, userAcl);
            // Map Qdrant results to RetrievedDocument format and perform post-filtering if necessary
            const retrievedDocuments = searchResultPoints // Cast to any[]
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
            const response = {
                answer,
                retrievedDocuments,
                queryId: `qid-${Date.now()}`, // Generate a simple query ID
            };
            return reply.send(response);
        },
    });
}
