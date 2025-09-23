import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AskRequestSchema,
  validateUserAuthorization
} from '@cw-rag-core/shared';
import {
  HybridSearchRequest,
  HybridSearchService,
  createHybridSearchService,
  VectorSearchService,
  KeywordSearchService,
  RerankerService,
  GuardedRetrievalService,
  createGuardedRetrievalService,
  QdrantKeywordSearchService,
  ReciprocalRankFusionService,
  HttpRerankerService,
  SentenceTransformersRerankerService,
  DEFAULT_RERANKER_CONFIG,
  RERANKER_MODELS,
  HybridSearchResult
} from '@cw-rag-core/retrieval';
import { createAnswerSynthesisService } from '../services/answer-synthesis.js';
import { createCitationService } from '../services/citation.js';
import { createAuditLogger } from '../utils/audit.js';
import { QdrantClient } from '../services/qdrant.js';
import { timeoutManager } from '../config/timeouts.js';
import { createAskRateLimitMiddleware } from '../middleware/rate-limit.js';

interface AskStreamRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  embeddingService: { embed(text: string): Promise<number[]> };
}

// Enhanced QdrantClient adapter (same as in ask.ts)
class EnhancedQdrantService implements VectorSearchService {
  constructor(
    private qdrantClient: QdrantClient,
    private collectionName: string
  ) {}

  async search(collectionName: string, params: any): Promise<any[]> {
    const results = await this.qdrantClient.search(this.collectionName, {
      vector: params.queryVector,
      limit: params.limit,
      filter: params.filter,
      with_payload: true
    });

    return results.map(result => ({
      id: result.id,
      score: result.score,
      payload: result.payload,
      content: result.payload?.content
    }));
  }

  async scroll(collectionName: string, params: any): Promise<any> {
    const scrollResult = await this.qdrantClient.scroll(this.collectionName, {
      filter: params.filter,
      limit: params.limit,
      with_payload: params.with_payload !== false,
      with_vector: params.with_vector === true
    });

    return scrollResult;
  }

  async discover(collectionName: string, params: any): Promise<any[]> {
    return this.search(collectionName, params);
  }
}

export async function askStreamRoute(fastify: FastifyInstance, options: AskStreamRouteOptions) {
  const auditLogger = createAuditLogger(fastify.log);

  // Create enhanced Qdrant service
  const enhancedQdrantService = new EnhancedQdrantService(
    options.qdrantClient,
    options.collectionName
  );

  // Create keyword search service
  const keywordSearchService: KeywordSearchService = new QdrantKeywordSearchService(
    enhancedQdrantService as any
  );

  // Create RRF fusion service
  const rrfFusionService = new ReciprocalRankFusionService();

  // Create reranker service
  const createRerankerService = (enabled: boolean = false): RerankerService | undefined => {
    if (!enabled) return undefined;

    try {
      const httpReranker = new HttpRerankerService({
        ...DEFAULT_RERANKER_CONFIG,
        enabled: true,
        model: RERANKER_MODELS.BGE_RERANKER_LARGE
      });

      return httpReranker;
    } catch (error) {
      fastify.log.warn({ error }, 'Failed to initialize reranker service');
      return undefined;
    }
  };

  const vectorSearchService = enhancedQdrantService;

  // Create hybrid search service
  const hybridSearchService: HybridSearchService = createHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    options.embeddingService,
    createRerankerService(true)
  );

  // Create guarded retrieval service
  const guardedRetrievalService: GuardedRetrievalService = createGuardedRetrievalService(
    hybridSearchService,
    fastify.log,
    true
  );

  // Create answer synthesis service
  const answerSynthesisService = createAnswerSynthesisService(true);

  // Create citation service
  const citationService = createCitationService(true);

  // Apply rate limiting middleware
  const rateLimitMiddleware = createAskRateLimitMiddleware(fastify);

  fastify.post('/ask/stream', {
    preHandler: rateLimitMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          userContext: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              groupIds: { type: 'array', items: { type: 'string' } },
              tenantId: { type: 'string' },
            },
            required: ['id', 'groupIds', 'tenantId'],
          },
          k: { type: 'integer', minimum: 1 },
          filter: { type: 'object' },
          docId: { type: 'string' },
          hybridSearch: {
            type: 'object',
            properties: {
              vectorWeight: { type: 'number', minimum: 0, maximum: 1 },
              keywordWeight: { type: 'number', minimum: 0, maximum: 1 },
              rrfK: { type: 'integer', minimum: 1 },
              enableKeywordSearch: { type: 'boolean' },
            },
          },
          reranker: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              model: { type: 'string' },
              topK: { type: 'integer', minimum: 1 },
            },
          },
          synthesis: {
            type: 'object',
            properties: {
              maxContextLength: { type: 'integer', minimum: 1 },
              includeCitations: { type: 'boolean' },
              answerFormat: { type: 'string', enum: ['markdown', 'plain'] },
            },
          },
          includeMetrics: { type: 'boolean' },
          includeDebugInfo: { type: 'boolean' },
        },
        required: ['query', 'userContext'],
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = performance.now();
      const {
        query,
        userContext,
        k,
        filter,
        docId,
        hybridSearch,
        reranker,
        synthesis,
        includeMetrics,
        includeDebugInfo
      } = request.body as any;

      const queryId = `qid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const qHash = Buffer.from(query).toString('base64').slice(0, 16);

      // Validate user authorization
      if (!validateUserAuthorization(userContext)) {
        auditLogger.logEntry({
          ts: new Date().toISOString(),
          route: '/ask/stream',
          tenant: userContext.tenantId || 'default',
          docId: qHash,
          source: 'api_request',
          action: 'block',
          findingsSummary: [{ type: 'authorization_failed', count: 1 }],
          status: 'blocked',
          ip: (request as any).ip,
          userAgent: (request as any).headers?.['user-agent']
        });

        return reply.status(403).send({
          error: 'Unauthorized',
          message: 'User authorization validation failed'
        });
      }

      // Set up Server-Sent Events
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');
      reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        reply.raw.write(message);
      };

      try {
        // Send connection opened event
        sendEvent('connection_opened', { queryId, timestamp: new Date().toISOString() });

        // Prepare hybrid search request
        let enhancedFilter = filter ? { ...filter } : undefined;

        if (docId) {
          const docIdFilter = {
            key: "docId",
            match: { value: docId }
          };

          if (enhancedFilter) {
            if (enhancedFilter.must) {
              enhancedFilter.must.push(docIdFilter);
            } else {
              enhancedFilter.must = [docIdFilter];
            }
          } else {
            enhancedFilter = {
              must: [docIdFilter]
            };
          }
        }

        const hybridSearchRequest: HybridSearchRequest = {
          query,
          limit: k || 10,
          vectorWeight: hybridSearch?.vectorWeight ?? 0.7,
          keywordWeight: hybridSearch?.keywordWeight ?? 0.3,
          rrfK: hybridSearch?.rrfK ?? 60,
          enableKeywordSearch: hybridSearch?.enableKeywordSearch ?? true,
          filter: enhancedFilter,
          tenantId: userContext.tenantId
        };

        // Perform guarded retrieval
        const retrievalResult = await guardedRetrievalService.retrieveWithGuardrail(
          options.collectionName,
          hybridSearchRequest,
          userContext,
          '/ask/stream'
        );

        // Handle "I don't know" case
        if (!retrievalResult.isAnswerable) {
          sendEvent('response_completed', {
            answer: retrievalResult.idkResponse?.message ||
                   "I don't have enough confidence in the available information to provide a reliable answer to your question.",
            retrievedDocuments: [],
            queryId,
            guardrailDecision: {
              isAnswerable: false,
              confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
              reasonCode: retrievalResult.idkResponse?.reasonCode,
              suggestions: retrievalResult.idkResponse?.suggestions,
            },
            isIDontKnow: true
          });

          sendEvent('done', { queryId, timestamp: new Date().toISOString() });
          reply.raw.end();
          return;
        }

        // Start streaming synthesis
        let answer = '';
        let citations: any = {};
        let metadata: any = {};

        try {
          for await (const chunk of answerSynthesisService.synthesizeAnswerStreaming({
            query,
            documents: retrievalResult.results || [],
            userContext,
            maxContextLength: synthesis?.maxContextLength || 8000,
            includeCitations: synthesis?.includeCitations ?? true,
            answerFormat: synthesis?.answerFormat || 'markdown',
            guardrailDecision: {
              isAnswerable: retrievalResult.guardrailDecision.isAnswerable,
              confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
              score: retrievalResult.guardrailDecision.score
            }
          })) {
            if (chunk.type === 'chunk' && typeof chunk.data === 'string') {
              answer += chunk.data;
              sendEvent('chunk', { text: chunk.data, accumulated: answer });
            } else if (chunk.type === 'citations') {
              citations = chunk.data;
              sendEvent('citations', chunk.data);
            } else if (chunk.type === 'metadata') {
              metadata = chunk.data;
              sendEvent('metadata', chunk.data);
            } else if (chunk.type === 'error') {
              sendEvent('error', { message: (chunk.data as Error).message });
              reply.raw.end();
              return;
            } else if (chunk.type === 'done') {
              break;
            }
          }

          // Convert results for final response
          const retrievedDocuments = (retrievalResult.results || [])
            .map((result: HybridSearchResult) => ({
              document: {
                id: result.id,
                content: result.content || '',
                metadata: {
                  tenantId: result.payload?.tenant || userContext.tenantId || 'default',
                  docId: result.payload?.docId || result.id,
                  acl: Array.isArray(result.payload?.acl) ? result.payload.acl : [result.payload?.acl || ''],
                  lang: result.payload?.lang,
                  url: result.payload?.url,
                  ...(result.payload?.version && { version: result.payload.version }),
                  ...(result.payload?.filepath && { filepath: result.payload.filepath }),
                  ...(result.payload?.authors && { authors: result.payload.authors }),
                  ...(result.payload?.keywords && { keywords: result.payload.keywords }),
                },
              },
              score: result.fusionScore || result.score || 0,
              searchType: result.searchType,
              vectorScore: result.vectorScore,
              keywordScore: result.keywordScore,
              fusionScore: result.fusionScore,
              rerankerScore: result.score !== result.fusionScore ? result.score : undefined,
              rank: result.rank
            }));

          const responseCitations = Object.values(citations).map((citation: any) => ({
            id: citation.id,
            number: citation.number,
            source: citation.source,
            freshness: citation.freshness,
            docId: citation.docId,
            version: citation.version,
            url: citation.url,
            filepath: citation.filepath,
            authors: citation.authors
          }));

          const totalTime = performance.now() - startTime;

          // Send final response completed event
          sendEvent('response_completed', {
            answer,
            retrievedDocuments,
            queryId,
            guardrailDecision: {
              isAnswerable: true,
              confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
            },
            freshnessStats: metadata.freshnessStats,
            citations: responseCitations,
            ...(includeMetrics && {
              metrics: {
                totalDuration: totalTime,
                vectorSearchDuration: retrievalResult.metrics.vectorSearchDuration,
                keywordSearchDuration: retrievalResult.metrics.keywordSearchDuration,
                fusionDuration: retrievalResult.metrics.fusionDuration,
                rerankerDuration: retrievalResult.metrics.rerankerDuration,
                guardrailDuration: retrievalResult.metrics.guardrailDuration,
                synthesisTime: metadata.synthesisTime || 0,
                vectorResultCount: retrievalResult.metrics.vectorResultCount,
                keywordResultCount: retrievalResult.metrics.keywordResultCount,
                finalResultCount: retrievalResult.metrics.finalResultCount,
                documentsReranked: retrievalResult.metrics.documentsReranked,
                rerankingEnabled: retrievalResult.metrics.rerankingEnabled
              }
            }),
            synthesisMetadata: {
              tokensUsed: metadata.tokensUsed || 0,
              modelUsed: metadata.modelUsed || 'unknown',
              contextTruncated: metadata.contextTruncated || false,
              confidence: metadata.confidence || 0,
              llmProvider: metadata.llmProvider
            }
          });

        } catch (error) {
          sendEvent('error', { message: `Streaming synthesis failed: ${(error as Error).message}` });
        }

        sendEvent('done', { queryId, timestamp: new Date().toISOString() });

      } catch (error) {
        const totalLatency = performance.now() - startTime;

        fastify.log.error({
          audit: true,
          tenant: userContext.tenantId || 'default',
          qHash,
          error: (error as Error).message,
          latencyMs: Math.round(totalLatency),
          route: '/ask/stream',
          timestamp: new Date().toISOString()
        }, 'Ask stream request failed');

        sendEvent('error', {
          message: 'An error occurred while processing your question. Please try again.',
          queryId,
          error: (error as Error).message
        });
      }

      reply.raw.end();
    },
  });
}