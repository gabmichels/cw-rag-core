import { searchDocuments } from '../services/qdrant.js';
import { AskRequestSchema, AskResponseSchema, validateUserAuthorization } from '@cw-rag-core/shared';
import { guardrailService } from '../services/guardrail.js';
import { createAuditLogger } from '../utils/audit.js';
export async function askRoute(fastify, options) {
    const auditLogger = createAuditLogger(fastify.log);
    fastify.post('/ask', {
        schema: {
            body: AskRequestSchema,
            response: {
                200: AskResponseSchema,
            },
        },
        handler: async (request, reply) => {
            const { query, userContext, k, filter } = request.body;
            // Validate user authorization first
            if (!validateUserAuthorization(userContext)) {
                return reply.status(403).send({
                    error: 'Unauthorized',
                    message: 'User authorization validation failed'
                });
            }
            try {
                // Perform vector search with enhanced RBAC pre-filtering
                const searchResultPoints = await searchDocuments(options.qdrantClient, options.collectionName, request.body, userContext);
                // Evaluate answerability using guardrail service
                const guardrailEvaluation = guardrailService.evaluateAnswerability(query, searchResultPoints, userContext);
                // Log guardrail decision using audit logger
                auditLogger.logEntry({
                    ts: new Date().toISOString(),
                    route: '/ask',
                    tenant: userContext.tenantId || 'default',
                    docId: `query-${Date.now()}`,
                    source: 'guardrail',
                    action: guardrailEvaluation.isAnswerable ? 'publish' : 'block',
                    findingsSummary: [{
                            type: 'answerability_check',
                            count: 1
                        }],
                    status: 'success',
                    ip: request.ip,
                    userAgent: request.headers['user-agent']
                });
                // Handle "I don't know" case
                if (!guardrailEvaluation.isAnswerable) {
                    const idkResponse = {
                        answer: guardrailEvaluation.idkResponse?.message ||
                            "I don't have enough confidence in the available information to provide a reliable answer to your question.",
                        retrievedDocuments: [],
                        queryId: `qid-${Date.now()}`,
                        guardrailDecision: {
                            isAnswerable: false,
                            confidence: guardrailEvaluation.score.confidence,
                            reasonCode: guardrailEvaluation.idkResponse?.reasonCode,
                            suggestions: guardrailEvaluation.idkResponse?.suggestions
                        }
                    };
                    return reply.send(idkResponse);
                }
                // Map Qdrant results to RetrievedDocument format for answerable queries
                const retrievedDocuments = searchResultPoints
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
                    score: hit.score || 1.0,
                }))
                    .map(doc => {
                    // Apply language relevance scoring if both user and document have language
                    if (userContext.language && doc.document.metadata.lang) {
                        const isLanguageMatch = userContext.language === doc.document.metadata.lang;
                        doc.score = doc.score * (isLanguageMatch ? 2.0 : 0.5);
                    }
                    return doc;
                });
                // Generate answer with confidence information
                const answer = generateAnswerWithConfidence(query, retrievedDocuments, guardrailEvaluation.score.confidence);
                const response = {
                    answer,
                    retrievedDocuments,
                    queryId: `qid-${Date.now()}`,
                    guardrailDecision: {
                        isAnswerable: true,
                        confidence: guardrailEvaluation.score.confidence,
                        reasonCode: undefined,
                        suggestions: undefined
                    }
                };
                return reply.send(response);
            }
            catch (error) {
                // Log error using audit logger
                auditLogger.logError('/ask', userContext.tenantId || 'default', `query-${Date.now()}`, 'guardrail', error.message, request.ip, request.headers['user-agent']);
                request.log.error('Guarded search error:', error);
                return reply.status(500).send({
                    error: 'Search failed',
                    message: 'An error occurred during document search'
                });
            }
        },
    });
    // Helper function to generate answer with confidence information
    function generateAnswerWithConfidence(query, documents, confidence) {
        if (documents.length === 0) {
            return "No relevant documents found for your query.";
        }
        const topDoc = documents[0];
        const docCount = documents.length;
        const confidencePercentage = Math.round(confidence * 100);
        return `Based on ${docCount} relevant document${docCount > 1 ? 's' : ''} (${confidencePercentage}% confidence), ` +
            `here's what I found about "${query}": ` +
            `${topDoc.document.content.substring(0, 200)}...`;
    }
}
