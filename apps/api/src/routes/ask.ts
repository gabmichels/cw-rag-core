import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import {
  AskRequest,
  AskResponse,
  RetrievedDocument,
  UserContext,
  AskRequestSchema,
  AskResponseSchema,
  validateUserAuthorization
} from '@cw-rag-core/shared';
import {
  HybridSearchResult,
  HybridSearchRequest,
  HybridSearchService,
  createHybridSearchService,
  VectorSearchService,
  KeywordSearchService,
  RerankerService,
  createAnswerabilityGuardrailService,
  GuardedRetrievalService,
  createGuardedRetrievalService,
  QdrantKeywordSearchService,
  ReciprocalRankFusionService,
  HttpRerankerService,
  SentenceTransformersRerankerService,
  DEFAULT_RERANKER_CONFIG,
  RERANKER_MODELS
} from '@cw-rag-core/retrieval';
import { createAnswerSynthesisService } from '../services/answer-synthesis.js';
import { createCitationService } from '../services/citation.js';
import { createLLMClientFactory } from '../services/llm-client.js';
import { createAuditLogger } from '../utils/audit.js';
import { QdrantClient } from '../services/qdrant.js';

interface AskRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  embeddingService: { embed(text: string): Promise<number[]> };
}

type AskRequestBody = FromSchema<typeof AskRequestSchema>;

// Enhanced QdrantClient adapter that implements both vector and keyword search interfaces
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

  // Add scroll method for keyword search compatibility
  async scroll(collectionName: string, params: any): Promise<any> {
    // Use existing search functionality as fallback for scroll
    return {
      points: await this.search(collectionName, params)
    };
  }

  // Add discover method for semantic keyword search
  async discover(collectionName: string, params: any): Promise<any[]> {
    // Fallback to regular search for now
    return this.search(collectionName, params);
  }
}

export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  const auditLogger = createAuditLogger(fastify.log);

  // Initialize core services - will be created below with enhanced service
  let vectorSearchService: VectorSearchService;

  // Create enhanced Qdrant service that supports both vector and keyword search
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

  // Create reranker service (with fallback)
  const createRerankerService = (enabled: boolean = false): RerankerService | undefined => {
    if (!enabled) return undefined;

    try {
      // Try HTTP reranker service first
      const httpReranker = new HttpRerankerService({
        ...DEFAULT_RERANKER_CONFIG,
        enabled: true,
        model: RERANKER_MODELS.BGE_RERANKER_LARGE
      });

      // Create fallback to local sentence transformers
      const fallbackReranker = new SentenceTransformersRerankerService({
        ...DEFAULT_RERANKER_CONFIG,
        enabled: true,
        model: RERANKER_MODELS.BGE_RERANKER_BASE
      });

      // Return HTTP service with fallback
      return httpReranker;
    } catch (error) {
      fastify.log.warn('Failed to initialize reranker service:', error);
      return undefined;
    }
  };

  // Use the enhanced service for vector search as well
  vectorSearchService = enhancedQdrantService;

  // Create hybrid search service
  const hybridSearchService: HybridSearchService = createHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    options.embeddingService,
    createRerankerService(true) // Enable reranker by default
  );

  // Create guarded retrieval service
  const guardedRetrievalService: GuardedRetrievalService = createGuardedRetrievalService(
    hybridSearchService,
    fastify.log,
    true // performance optimized
  );

  // Create answer synthesis service
  const answerSynthesisService = createAnswerSynthesisService(true);

  // Create citation service
  const citationService = createCitationService(true);

  fastify.post('/ask', {
    schema: {
      body: AskRequestSchema,
      response: {
        200: AskResponseSchema,
      },
    },
    handler: async (request: any, reply: FastifyReply) => {
      const startTime = performance.now();
      const {
        query,
        userContext,
        k,
        filter,
        hybridSearch,
        reranker,
        synthesis,
        includeMetrics,
        includeDebugInfo
      } = request.body;

      const queryId = `qid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Validate user authorization first
      if (!validateUserAuthorization(userContext)) {
        auditLogger.logError(
          '/ask',
          userContext.tenantId || 'default',
          queryId,
          'authorization',
          'User authorization validation failed',
          (request as any).ip,
          (request as any).headers?.['user-agent']
        );

        return reply.status(403).send({
          error: 'Unauthorized',
          message: 'User authorization validation failed'
        });
      }

      const debugSteps: string[] = [];
      let hybridSearchConfig: Record<string, any> = {};
      let rerankerConfig: Record<string, any> = {};
      let guardrailConfig: Record<string, any> = {};

      try {
        // Prepare hybrid search request with enhanced configuration
        const hybridSearchRequest: HybridSearchRequest = {
          query,
          limit: k || 10,
          vectorWeight: hybridSearch?.vectorWeight ?? 0.7,
          keywordWeight: hybridSearch?.keywordWeight ?? 0.3,
          rrfK: hybridSearch?.rrfK ?? 60,
          enableKeywordSearch: hybridSearch?.enableKeywordSearch ?? true,
          filter,
          tenantId: userContext.tenantId
        };

        if (includeDebugInfo) {
          hybridSearchConfig = { ...hybridSearchRequest };
          debugSteps.push('Prepared hybrid search configuration');
        }

        // Configure reranker if specified in request
        if (reranker?.enabled !== undefined) {
          const tenantConfig = await hybridSearchService.getTenantConfig(
            userContext.tenantId || 'default'
          );
          tenantConfig.rerankerEnabled = reranker.enabled;

          if (reranker.enabled && reranker.model) {
            tenantConfig.rerankerConfig = {
              model: reranker.model,
              topK: reranker.topK || 8,
              scoreThreshold: 0.0
            };
          }

          await hybridSearchService.updateTenantConfig(tenantConfig);

          if (includeDebugInfo) {
            rerankerConfig = { ...tenantConfig.rerankerConfig };
            debugSteps.push('Updated reranker configuration');
          }
        }

        // Perform guarded retrieval (includes hybrid search + guardrails)
        const retrievalStartTime = performance.now();
        const retrievalResult = await guardedRetrievalService.retrieveWithGuardrail(
          options.collectionName,
          hybridSearchRequest,
          userContext,
          '/ask'
        );
        const retrievalDuration = performance.now() - retrievalStartTime;

        if (includeDebugInfo) {
          debugSteps.push('Completed guarded retrieval');
          guardrailConfig = {
            enabled: true,
            decision: retrievalResult.guardrailDecision.isAnswerable ? 'ANSWERABLE' : 'NOT_ANSWERABLE'
          };
        }

        // Log guardrail decision
        auditLogger.logEntry({
          ts: new Date().toISOString(),
          route: '/ask',
          tenant: userContext.tenantId || 'default',
          docId: queryId,
          source: 'guardrail',
          action: retrievalResult.isAnswerable ? 'publish' : 'block',
          findingsSummary: [{
            type: 'answerability_check',
            count: 1
          }],
          status: 'success',
          ip: (request as any).ip,
          userAgent: (request as any).headers?.['user-agent']
        });

        // Handle "I don't know" case
        if (!retrievalResult.isAnswerable) {
          const idkResponse: AskResponse = {
            answer: retrievalResult.idkResponse?.message ||
                   "I don't have enough confidence in the available information to provide a reliable answer to your question.",
            retrievedDocuments: [],
            queryId,
            guardrailDecision: {
              isAnswerable: false,
              confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
              reasonCode: retrievalResult.idkResponse?.reasonCode,
              suggestions: retrievalResult.idkResponse?.suggestions,
              scoreStats: retrievalResult.guardrailDecision.score?.scoreStats ? {
                mean: retrievalResult.guardrailDecision.score.scoreStats.mean,
                max: retrievalResult.guardrailDecision.score.scoreStats.max,
                min: retrievalResult.guardrailDecision.score.scoreStats.min,
                stdDev: retrievalResult.guardrailDecision.score.scoreStats.stdDev,
                count: retrievalResult.guardrailDecision.score.scoreStats.count
              } : undefined,
              algorithmScores: retrievalResult.guardrailDecision.score?.algorithmScores
            },
            ...(includeMetrics && {
              metrics: {
                totalDuration: performance.now() - startTime,
                guardrailDuration: retrievalResult.metrics.guardrailDuration,
                vectorSearchDuration: retrievalResult.metrics.vectorSearchDuration,
                keywordSearchDuration: retrievalResult.metrics.keywordSearchDuration,
                fusionDuration: retrievalResult.metrics.fusionDuration,
                rerankerDuration: retrievalResult.metrics.rerankerDuration,
                vectorResultCount: retrievalResult.metrics.vectorResultCount,
                keywordResultCount: retrievalResult.metrics.keywordResultCount,
                finalResultCount: retrievalResult.metrics.finalResultCount,
                documentsReranked: retrievalResult.metrics.documentsReranked,
                rerankingEnabled: retrievalResult.metrics.rerankingEnabled
              }
            }),
            ...(includeDebugInfo && {
              debug: {
                hybridSearchConfig,
                rerankerConfig,
                guardrailConfig,
                retrievalSteps: [...debugSteps, 'Returned IDK response']
              }
            })
          };

          return reply.send(idkResponse);
        }

        if (includeDebugInfo) {
          debugSteps.push('Proceeding with answer synthesis');
        }

        // Synthesize answer with citations
        const synthesisStartTime = performance.now();
        const synthesisResponse = await answerSynthesisService.synthesizeAnswer({
          query,
          documents: retrievalResult.results || [],
          userContext,
          maxContextLength: synthesis?.maxContextLength || 8000,
          includeCitations: synthesis?.includeCitations ?? true,
          answerFormat: synthesis?.answerFormat || 'markdown'
        });
        const synthesisTime = performance.now() - synthesisStartTime;

        if (includeDebugInfo) {
          debugSteps.push('Completed answer synthesis');
        }

        // Convert HybridSearchResult to RetrievedDocument format for response
        const retrievedDocuments: RetrievedDocument[] = (retrievalResult.results || [])
          .map(result => ({
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

        const totalTime = performance.now() - startTime;

        // Log synthesis metrics
        const qualityMetrics = answerSynthesisService.getQualityMetrics();
        if (qualityMetrics) {
          fastify.log.info('Answer synthesis metrics', {
            queryId,
            answerLength: qualityMetrics.answerLength,
            citationCount: qualityMetrics.citationCount,
            contextUtilization: qualityMetrics.contextUtilization,
            responseLatency: qualityMetrics.responseLatency,
            totalLatency: totalTime,
            model: qualityMetrics.model
          });
        }

        // Extract citations for response format
        const responseCitations = Object.values(synthesisResponse.citations).map(citation => ({
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

        const response: AskResponse = {
          answer: synthesisResponse.answer,
          retrievedDocuments,
          queryId,
          guardrailDecision: {
            isAnswerable: true,
            confidence: synthesisResponse.confidence,
            scoreStats: retrievalResult.guardrailDecision.score?.scoreStats ? {
              mean: retrievalResult.guardrailDecision.score.scoreStats.mean,
              max: retrievalResult.guardrailDecision.score.scoreStats.max,
              min: retrievalResult.guardrailDecision.score.scoreStats.min,
              stdDev: retrievalResult.guardrailDecision.score.scoreStats.stdDev,
              count: retrievalResult.guardrailDecision.score.scoreStats.count
            } : undefined,
            algorithmScores: retrievalResult.guardrailDecision.score?.algorithmScores
          },
          freshnessStats: synthesisResponse.freshnessStats,
          citations: responseCitations,
          ...(includeMetrics && {
            metrics: {
              totalDuration: totalTime,
              vectorSearchDuration: retrievalResult.metrics.vectorSearchDuration,
              keywordSearchDuration: retrievalResult.metrics.keywordSearchDuration,
              fusionDuration: retrievalResult.metrics.fusionDuration,
              rerankerDuration: retrievalResult.metrics.rerankerDuration,
              guardrailDuration: retrievalResult.metrics.guardrailDuration,
              synthesisTime,
              vectorResultCount: retrievalResult.metrics.vectorResultCount,
              keywordResultCount: retrievalResult.metrics.keywordResultCount,
              finalResultCount: retrievalResult.metrics.finalResultCount,
              documentsReranked: retrievalResult.metrics.documentsReranked,
              rerankingEnabled: retrievalResult.metrics.rerankingEnabled
            }
          }),
          synthesisMetadata: {
            tokensUsed: synthesisResponse.tokensUsed,
            modelUsed: synthesisResponse.modelUsed,
            contextTruncated: synthesisResponse.contextTruncated,
            confidence: synthesisResponse.confidence,
            llmProvider: qualityMetrics?.llmProvider
          },
          ...(includeDebugInfo && {
            debug: {
              hybridSearchConfig,
              rerankerConfig,
              guardrailConfig,
              retrievalSteps: [...debugSteps, 'Completed full pipeline']
            }
          })
        };

        return reply.send(response);

      } catch (error) {
        // Log error using audit logger
        auditLogger.logError(
          '/ask',
          userContext.tenantId || 'default',
          queryId,
          'pipeline',
          (error as Error).message,
          (request as any).ip,
          (request as any).headers?.['user-agent']
        );

        fastify.log.error('Ask pipeline error:', {
          queryId,
          error: (error as Error).message,
          stack: (error as Error).stack,
          query: query.substring(0, 100) // Log first 100 chars of query for debugging
        });

        // Check if it's a timeout error
        if ((error as Error).message.includes('timeout') || (error as Error).message.includes('Request timeout')) {
          return reply.status(408).send({
            error: 'Request Timeout',
            message: 'The request took too long to process. Please try again with a simpler query.',
            queryId
          });
        }

        // Check if it's a service unavailable error
        if ((error as Error).message.includes('service unavailable') || (error as Error).message.includes('connection')) {
          return reply.status(503).send({
            error: 'Service Unavailable',
            message: 'One or more required services are temporarily unavailable. Please try again later.',
            queryId
          });
        }

        // Return fallback response for other errors
        return reply.status(500).send({
          error: 'Processing Failed',
          message: 'An error occurred while processing your question. Please try rephrasing your query or try again later.',
          queryId,
          ...(includeDebugInfo && {
            debug: {
              error: (error as Error).message,
              retrievalSteps: debugSteps
            }
          })
        });
      }
    },
  });
}