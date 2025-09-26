import { FastifyInstance, FastifyReply } from 'fastify';
import {
  AskResponse,
  RetrievedDocument,
  AskRequestSchema,
  // AskResponseSchema, // Removed as it's defined inline now for clarity and direct control
  validateUserAuthorization,
  detectLanguage
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
  HybridSearchResult,
  StructuredHybridSearchResult,
  SectionAwareHybridSearchService,
  createSectionAwareHybridSearchService,
  GuardedRetrievalResult // Import GuardedRetrievalResult
} from '@cw-rag-core/retrieval';
import { createAnswerSynthesisService } from '../services/answer-synthesis.js';
import { createCitationService } from '../services/citation.js';
import { createAuditLogger } from '../utils/audit.js';
import { QdrantClient } from '../services/qdrant.js';
import { timeoutManager, DEFAULT_TIMEOUTS } from '../config/timeouts.js';
import { createAskRateLimitMiddleware } from '../middleware/rate-limit.js';

interface AskRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
  embeddingService: { embed(text: string): Promise<number[]> };
}


// Enhanced QdrantClient adapter that implements both vector and keyword search interfaces
class EnhancedQdrantService implements VectorSearchService {
  constructor(
    private qdrantClient: QdrantClient,
    private collectionName: string
  ) {}

  async search(collectionName: string, params: any): Promise<any[]> {
    console.log('Vector search - filter:', JSON.stringify(params.filter, null, 2));
    console.log('Vector search - limit:', params.limit);

    const results = await this.qdrantClient.search(this.collectionName, {
      vector: params.queryVector,
      limit: params.limit,
      filter: params.filter,
      with_payload: true
    });

    console.log('Vector search results count:', results.length);
    const targetPointId = 'a3d5597a-1d56-b174-03e0-fc7f2722b64e';
    let targetFound = false;

    results.forEach((result, i) => {
      const content = result.payload?.content;
      const contentPreview = typeof content === 'string' ? content.substring(0, 100) : String(content || '').substring(0, 100);
      const isTarget = result.id === targetPointId;
      if (isTarget) {
        targetFound = true;
        console.log(`🎯 TARGET FOUND! Result ${i + 1}: score=${result.score}, id=${result.id}, docId=${result.payload?.docId}, content preview=${contentPreview}...`);
      } else {
        console.log(`Result ${i + 1}: score=${result.score}, id=${result.id}, docId=${result.payload?.docId}, content preview=${contentPreview}...`);
      }
    });

    if (!targetFound) {
      console.log(`❌ TARGET POINT ${targetPointId} NOT FOUND in top ${results.length} results!`);
    }

    return results.map(result => ({
      id: result.id,
      score: result.score,
      payload: result.payload,
      content: result.payload?.content
    }));
  }

  // Add scroll method for keyword search compatibility
  async scroll(collectionName: string, params: any): Promise<any> {
    // For keyword search, use Qdrant's scroll API directly without vectors
    const scrollResult = await this.qdrantClient.scroll(this.collectionName, {
      filter: params.filter,
      limit: params.limit,
      with_payload: params.with_payload !== false,
      with_vector: params.with_vector === true
    });

    return scrollResult;
  }

  // Add discover method for semantic keyword search
  async discover(collectionName: string, params: any): Promise<any[]> {
    // Fallback to regular search for now
    return this.search(collectionName, params);
  }
}

export async function askRoute(fastify: FastifyInstance, options: AskRouteOptions) {
  const auditLogger = createAuditLogger(fastify.log);

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
      fastify.log.warn({ error }, 'Failed to initialize reranker service');
      return undefined;
    }
  };

  // Use the enhanced service for vector search as well
  const vectorSearchService = enhancedQdrantService;

  // Create section-aware hybrid search service
  const hybridSearchService: SectionAwareHybridSearchService = createSectionAwareHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    options.embeddingService,
    createRerankerService(true), // Enable reranker by default
    options.qdrantClient,
    {
      enabled: process.env.SECTION_AWARE_SEARCH !== 'false', // Enable by default
      maxSectionsToComplete: 10, // Increased to handle more sections
      sectionCompletionTimeoutMs: 2500,
      mergeStrategy: 'interleave',
      preserveOriginalRanking: false,
      minTriggerConfidence: 0.7
    }
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

  // Apply rate limiting middleware to /ask endpoint
  const rateLimitMiddleware = createAskRateLimitMiddleware(fastify);

  fastify.post('/ask', {
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
      response: {
        200: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            retrievedDocuments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
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
                    required: ['id', 'content', 'metadata'],
                  },
                  score: { type: 'number' },
                  freshness: {
                    type: 'object',
                    properties: {
                      category: { type: 'string', enum: ['Fresh', 'Recent', 'Stale'] },
                      badge: { type: 'string' },
                      humanReadable: { type: 'string' },
                      ageInDays: { type: 'number' },
                    },
                    required: ['category', 'badge', 'humanReadable', 'ageInDays'],
                  },
                  searchType: { type: 'string', enum: ['hybrid', 'vector_only', 'keyword_only'] },
                  vectorScore: { type: 'number' },
                  keywordScore: { type: 'number' },
                  fusionScore: { type: 'number' },
                  rerankerScore: { type: 'number' },
                  rank: { type: 'integer', minimum: 1 },
                },
                required: ['document', 'score'],
              },
            },
            queryId: { type: 'string' },
            guardrailDecision: {
              type: 'object',
              properties: {
                isAnswerable: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                reasonCode: { type: 'string' },
                suggestions: { type: 'array', items: { type: 'string' } },
                threshold: { // Add threshold to schema for debugging
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    minConfidence: { type: 'number' },
                    minTopScore: { type: 'number' },
                    minMeanScore: { type: 'number' },
                    maxStdDev: { type: 'number' },
                    minResultCount: { type: 'integer' },
                  },
                  required: ['type', 'minConfidence', 'minTopScore', 'minMeanScore', 'maxStdDev', 'minResultCount'],
                },
                scoreStats: {
                  type: 'object',
                  properties: {
                    mean: { type: 'number' },
                    max: { type: 'number' },
                    min: { type: 'number' },
                    stdDev: { type: 'number' },
                    count: { type: 'integer', minimum: 0 },
                  },
                  required: ['mean', 'max', 'min', 'stdDev', 'count'],
                },
                algorithmScores: {
                  type: 'object',
                  properties: {
                    statistical: { type: 'number' },
                    threshold: { type: 'number' },
                    mlFeatures: { type: 'number' },
                    rerankerConfidence: { type: 'number' },
                  },
                  required: ['statistical', 'threshold', 'mlFeatures'],
                },
                sourceAwareConfidence: { // Detailed schema for SourceAwareConfidenceResult
                  type: 'object',
                  properties: {
                    finalConfidence: { type: 'number', minimum: 0, maximum: 1 },
                    stageConfidences: {
                      type: 'object',
                      properties: {
                        vector: {
                          type: 'object',
                          properties: {
                            confidence: { type: 'number' },
                            quality: { type: 'number' },
                            resultCount: { type: 'integer' },
                            topScore: { type: 'number' },
                            meanScore: { type: 'number' },
                            stdDev: { type: 'number' },
                          },
                          required: ['confidence', 'quality', 'resultCount', 'topScore', 'meanScore', 'stdDev'],
                        },
                        keyword: {
                          type: 'object',
                          properties: {
                            confidence: { type: 'number' },
                            quality: { type: 'number' },
                            resultCount: { type: 'integer' },
                            topScore: { type: 'number' },
                            meanScore: { type: 'number' },
                            stdDev: { type: 'number' },
                          },
                          required: ['confidence', 'quality', 'resultCount', 'topScore', 'meanScore', 'stdDev'],
                        },
                        fusion: {
                          type: 'object',
                          properties: {
                            confidence: { type: 'number' },
                            quality: { type: 'number' },
                            resultCount: { type: 'integer' },
                            topScore: { type: 'number' },
                            meanScore: { type: 'number' },
                            stdDev: { type: 'number' },
                          },
                          required: ['confidence', 'quality', 'resultCount', 'topScore', 'meanScore', 'stdDev'],
                        },
                        reranking: {
                          type: 'object',
                          properties: {
                            confidence: { type: 'number' },
                            quality: { type: 'number' },
                            resultCount: { type: 'integer' },
                            topScore: { type: 'number' },
                            meanScore: { type: 'number' },
                            stdDev: { type: 'number' },
                          },
                          required: ['confidence', 'quality', 'resultCount', 'topScore', 'meanScore', 'stdDev'],
                        },
                        rawFusionResults: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: { id: { type: 'string' }, score: { type: 'number' }, searchType: { type: 'string' } },
                            required: ['id', 'score'],
                          }
                        }
                      },
                      required: ['vector', 'fusion'],
                    },
                    degradationAlerts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          stage: { type: 'string' },
                          severity: { type: 'number' },
                          description: { type: 'string' },
                          recommendation: { type: 'string' },
                        },
                        required: ['stage', 'severity', 'description', 'recommendation'],
                      },
                    },
                    recommendedStrategy: { type: 'string' },
                    explanation: { type: 'string' },
                    computationTime: { type: 'number' },
                  },
                  required: ['finalConfidence', 'stageConfidences', 'degradationAlerts', 'recommendedStrategy', 'explanation', 'computationTime'],
                }
              },
              required: ['isAnswerable', 'confidence'],
            },
            freshnessStats: {
              type: 'object',
              properties: {
                totalDocuments: { type: 'integer', minimum: 0 },
                freshPercentage: { type: 'number', minimum: 0, maximum: 100 },
                recentPercentage: { type: 'number', minimum: 0, maximum: 100 },
                stalePercentage: { type: 'number', minimum: 0, maximum: 100 },
                avgAgeInDays: { type: 'number', minimum: 0 },
              },
              required: ['totalDocuments', 'freshPercentage', 'recentPercentage', 'stalePercentage', 'avgAgeInDays'],
            },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  number: { type: 'integer', minimum: 1 },
                  source: { type: 'string' },
                  freshness: {
                    type: 'object',
                    properties: {
                      category: { type: 'string', enum: ['Fresh', 'Recent', 'Stale'] },
                      badge: { type: 'string' },
                      humanReadable: { type: 'string' },
                      ageInDays: { type: 'number' },
                    },
                    required: ['category', 'badge', 'humanReadable', 'ageInDays'],
                  },
                  docId: { type: 'string' },
                  version: { type: 'string' },
                  url: { type: 'string', format: 'uri' },
                  filepath: { type: 'string' },
                  authors: { type: 'array', items: { type: 'string' } },
                },
                required: ['id', 'number', 'source'],
              },
            },
            metrics: {
              type: 'object',
              properties: {
                totalDuration: { type: 'number', minimum: 0 },
                vectorSearchDuration: { type: 'number', minimum: 0 },
                keywordSearchDuration: { type: 'number', minimum: 0 },
                fusionDuration: { type: 'number', minimum: 0 },
                rerankerDuration: { type: 'number', minimum: 0 },
                guardrailDuration: { type: 'number', minimum: 0 },
                synthesisTime: { type: 'number', minimum: 0 },
                vectorResultCount: { type: 'integer', minimum: 0 },
                keywordResultCount: { type: 'integer', minimum: 0 },
                finalResultCount: { type: 'integer', minimum: 0 },
                documentsReranked: { type: 'integer', minimum: 0 },
                rerankingEnabled: { type: 'boolean' },
                sectionCompletionMetrics: {
                  type: 'object',
                  properties: {
                    sectionsDetected: { type: 'integer', minimum: 0 },
                    sectionsCompleted: { type: 'integer', minimum: 0 },
                    sectionsReconstructed: { type: 'integer', minimum: 0 },
                    totalAdditionalChunks: { type: 'integer', minimum: 0 },
                    completionDuration: { type: 'number', minimum: 0 },
                    timeoutOccurred: { type: 'boolean' }
                  },
                  required: ['sectionsDetected', 'sectionsCompleted', 'sectionsReconstructed', 'totalAdditionalChunks', 'completionDuration', 'timeoutOccurred']
                }
              },
              required: ['totalDuration'],
            },
            synthesisMetadata: {
              type: 'object',
              properties: {
                tokensUsed: { type: 'integer', minimum: 0 },
                modelUsed: { type: 'string' },
                contextTruncated: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                llmProvider: { type: 'string' },
              },
              required: ['tokensUsed', 'modelUsed', 'contextTruncated', 'confidence'],
            },
            debug: {
              type: 'object',
              properties: {
                hybridSearchConfig: { type: 'object' },
                rerankerConfig: { type: 'object' },
                guardrailConfig: { type: 'object' },
                retrievalSteps: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['answer', 'retrievedDocuments', 'queryId'],
        },
      },
    },
    handler: async (request: any, reply: FastifyReply) => {
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
      } = request.body;

      const queryId = `qid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const qHash = Buffer.from(query).toString('base64').slice(0, 16); // Hash query for audit

      // Get timeout configuration
      const timeouts = timeoutManager.getTimeoutConfig(userContext.tenantId);

      // Validate user authorization first
      if (!validateUserAuthorization(userContext)) {
        // Enhanced audit logging with required fields
        auditLogger.logEntry({
          ts: new Date().toISOString(),
          route: '/ask',
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

      const debugSteps: string[] = [];
      let hybridSearchConfig: Record<string, any> = {};
      let rerankerConfig: Record<string, any> = {};
      let guardrailConfig: Record<string, any> = {};

      try {
        // Apply overall timeout to the entire request
        const overallTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Overall request timeout after ${timeouts.overall}ms`));
          }, timeouts.overall);
        });

        const processRequest = async () => {
          // Prepare hybrid search request with enhanced configuration
          let enhancedFilter = filter ? { ...filter } : undefined;

          // Add docId filter in Qdrant format if provided
          if (docId) {
            const docIdFilter = {
              key: "docId",
              match: { value: docId }
            };

            if (enhancedFilter) {
              // If there's already a filter, add docId to existing must conditions
              if (enhancedFilter.must) {
                enhancedFilter.must.push(docIdFilter);
              } else {
                enhancedFilter.must = [docIdFilter];
              }
            } else {
              // If no existing filter, create new filter with just docId
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

          // Perform guarded retrieval (includes hybrid search + guardrails) with timeout
          const retrievalStartTime = performance.now();
          const retrievalResult: GuardedRetrievalResult = await timeoutManager.executeWithTimeout(
            () => guardedRetrievalService.retrieveWithGuardrail(
              options.collectionName,
              hybridSearchRequest,
              userContext,
              '/ask'
            ),
            timeouts.overall - 5000, // Leave 5s buffer for synthesis
            'Retrieval pipeline'
          );
          const retrievalDuration = performance.now() - retrievalStartTime;

          return { retrievalResult, retrievalDuration };
        };

        const { retrievalResult, retrievalDuration } = await Promise.race([
          processRequest(),
          overallTimeoutPromise
        ]);

        if (includeDebugInfo) {
          debugSteps.push('Completed guarded retrieval');

          guardrailConfig = {
            enabled: true,
            decision: retrievalResult.guardrailDecision.isAnswerable ? 'ANSWERABLE' : 'NOT_ANSWERABLE',
            sectionCompletionMetrics: retrievalResult.sectionCompletionMetrics, // Include in debug
          };
        }

        // Enhanced audit logging with required fields
        auditLogger.logEntry({
          ts: new Date().toISOString(),
          route: '/ask',
          tenant: userContext.tenantId || 'default',
          docId: qHash, // Use query hash instead of queryId for security
          source: 'retrieval_pipeline',
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
          const totalLatency = performance.now() - startTime;

          // Enhanced audit log for IDK responses with required fields
          fastify.log.info({
            audit: true,
            tenant: userContext.tenantId || 'default',
            qHash,
            k: k || 10,
            rrfUsed: hybridSearch?.rrfK ?? 60,
            rerankerUsed: retrievalResult.metrics.rerankingEnabled,
            idk: true,
            latencyMs: Math.round(totalLatency),
            route: '/ask',
            timestamp: new Date().toISOString()
          }, 'Ask request completed - IDK response');

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
              threshold: retrievalResult.guardrailDecision.threshold,
              scoreStats: retrievalResult.guardrailDecision.score?.scoreStats ? {
                mean: retrievalResult.guardrailDecision.score.scoreStats.mean,
                max: retrievalResult.guardrailDecision.score.scoreStats.max,
                min: retrievalResult.guardrailDecision.score.scoreStats.min,
                stdDev: retrievalResult.guardrailDecision.score.scoreStats.stdDev,
                count: retrievalResult.guardrailDecision.score.scoreStats.count
              } : undefined,
              algorithmScores: retrievalResult.guardrailDecision.score?.algorithmScores,
              sourceAwareConfidence: retrievalResult.guardrailDecision.score?.sourceAwareConfidence
            },
            ...(includeMetrics && {
              metrics: {
                totalDuration: totalLatency,
                guardrailDuration: retrievalResult.metrics.guardrailDuration,
                vectorSearchDuration: retrievalResult.metrics.vectorSearchDuration,
                keywordSearchDuration: retrievalResult.metrics.keywordSearchDuration,
                fusionDuration: retrievalResult.metrics.fusionDuration,
                rerankerDuration: retrievalResult.metrics.rerankerDuration,
                vectorResultCount: retrievalResult.metrics.vectorResultCount,
                keywordResultCount: retrievalResult.metrics.keywordResultCount,
                finalResultCount: retrievalResult.metrics.finalResultCount,
                documentsReranked: retrievalResult.metrics.documentsReranked,
                rerankingEnabled: retrievalResult.metrics.rerankingEnabled,
                sectionCompletionMetrics: retrievalResult.sectionCompletionMetrics || { // Include here
                  sectionsDetected: 0, sectionsCompleted: 0, sectionsReconstructed: 0,
                  totalAdditionalChunks: 0, completionDuration: 0, timeoutOccurred: false
                }
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

        // Detect query language for LLM response
        const detectedLanguage = detectLanguage(query).toUpperCase();

        // Check if streaming is enabled
        const streamingEnabled = process.env.LLM_STREAMING === 'true';

        if (streamingEnabled) {
          // Handle streaming synthesis - collect all chunks then return
          let answer = '';
          let formattedAnswer = '';
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
                isAnswerable: retrievalResult.isAnswerable,
                confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
                score: retrievalResult.guardrailDecision.score
              },
              languageContext: {
                detectedLanguage
              }
            })) {
              if (chunk.type === 'chunk' && typeof chunk.data === 'string') {
                answer += chunk.data;
              } else if (chunk.type === 'citations') {
                citations = chunk.data;
              } else if (chunk.type === 'metadata') {
                metadata = chunk.data;
              } else if (chunk.type === 'formatted_answer') {
                formattedAnswer = chunk.data as string;
              } else if (chunk.type === 'error') {
                throw chunk.data as Error;
              } else if (chunk.type === 'done') {
                break;
              }
            }

            // Convert streaming result to regular response format
            const retrievedDocuments: RetrievedDocument[] = (retrievalResult.results || [])
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

            const streamingResponse: AskResponse = {
              answer: formattedAnswer || answer, // Use formatted answer with bibliography if available
              retrievedDocuments,
              queryId,
              guardrailDecision: {
                isAnswerable: retrievalResult.isAnswerable,
                confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
                scoreStats: retrievalResult.guardrailDecision.score?.scoreStats ? {
                  mean: retrievalResult.guardrailDecision.score.scoreStats.mean,
                  max: retrievalResult.guardrailDecision.score.scoreStats.max,
                  min: retrievalResult.guardrailDecision.score.scoreStats.min,
                  stdDev: retrievalResult.guardrailDecision.score.scoreStats.stdDev,
                  count: retrievalResult.guardrailDecision.score.scoreStats.count
                } : undefined,
                algorithmScores: retrievalResult.guardrailDecision.score?.algorithmScores,
                sourceAwareConfidence: retrievalResult.guardrailDecision.score?.sourceAwareConfidence
              },
              freshnessStats: metadata.freshnessStats,
              citations: responseCitations,
              ...(includeMetrics && {
                metrics: {
                  totalDuration: totalTime,
                  vectorSearchDuration: retrievalResult.metrics.vectorSearchDuration,
                  keywordSearchDuration: retrievalResult.metrics.keywordSearchDuration, // Direct access
                  fusionDuration: retrievalResult.metrics.fusionDuration,
                  rerankerDuration: retrievalResult.metrics.rerankerDuration,
                  guardrailDuration: retrievalResult.metrics.guardrailDuration,
                  synthesisTime: metadata.synthesisTime || 0,
                  vectorResultCount: retrievalResult.metrics.vectorResultCount,
                  keywordResultCount: retrievalResult.metrics.keywordResultCount,
                  finalResultCount: retrievalResult.metrics.finalResultCount,
                  documentsReranked: retrievalResult.metrics.documentsReranked,
                  rerankingEnabled: retrievalResult.metrics.rerankingEnabled,
                  sectionCompletionMetrics: retrievalResult.sectionCompletionMetrics || { // Direct from GuardedRetrievalResult
                    sectionsDetected: 0, sectionsCompleted: 0, sectionsReconstructed: 0,
                    totalAdditionalChunks: 0, completionDuration: 0, timeoutOccurred: false
                  }
                }
              }),
              synthesisMetadata: {
                tokensUsed: metadata.tokensUsed || 0,
                modelUsed: metadata.modelUsed || 'unknown',
                contextTruncated: metadata.contextTruncated || false,
                confidence: metadata.confidence || 0,
                llmProvider: metadata.llmProvider
              },
              ...(includeDebugInfo && {
                debug: {
                  hybridSearchConfig,
                  rerankerConfig,
                  guardrailConfig,
                  retrievalSteps: [...debugSteps, 'Completed streaming synthesis']
                }
              })
            };

            return reply.send(streamingResponse);

          } catch (error) {
            throw new Error(`Streaming synthesis failed: ${(error as Error).message}`);
          }
        }

        // Non-streaming synthesis with timeout
        const synthesisStartTime = performance.now();
        const synthesisResult = await timeoutManager.executeWithTimeout(
          () => answerSynthesisService.synthesizeAnswer({
            query,
            documents: retrievalResult.results || [],
            userContext,
            maxContextLength: synthesis?.maxContextLength || 8000,
            includeCitations: synthesis?.includeCitations ?? true,
            answerFormat: synthesis?.answerFormat || 'markdown',
            guardrailDecision: {
              isAnswerable: retrievalResult.isAnswerable,
              confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
              score: retrievalResult.guardrailDecision.score
            },
            languageContext: {
              detectedLanguage
            }
          }),
          timeouts.llm,
          'LLM synthesis'
        );
        const synthesisResponse = synthesisResult;
        const synthesisTime = performance.now() - synthesisStartTime;

        if (includeDebugInfo) {
          debugSteps.push('Completed answer synthesis');
        }

        // Convert HybridSearchResult to RetrievedDocument format for response
        const retrievedDocuments: RetrievedDocument[] = (retrievalResult.results || [])
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

        const totalTime = performance.now() - startTime;

        // Log synthesis metrics
        const qualityMetrics = answerSynthesisService.getQualityMetrics();
        if (qualityMetrics) {
          fastify.log.info({
            queryId,
            answerLength: qualityMetrics.answerLength,
            citationCount: qualityMetrics.citationCount,
            contextUtilization: qualityMetrics.contextUtilization,
            responseLatency: qualityMetrics.responseLatency,
            totalLatency: totalTime,
            model: qualityMetrics.model
          }, 'Answer synthesis metrics');
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

        const requestDuration = performance.now() - startTime;

        // Enhanced audit log for successful responses with required fields
        fastify.log.info({
          audit: true,
          tenant: userContext.tenantId || 'default',
          qHash,
          k: k || 10,
          rrfUsed: hybridSearch?.rrfK ?? 60,
          rerankerUsed: retrievalResult.metrics.rerankingEnabled,
          idk: false,
          latencyMs: Math.round(requestDuration),
          route: '/ask',
          timestamp: new Date().toISOString()
        }, 'Ask request completed - Success');

        const response: AskResponse = {
          answer: synthesisResponse.answer,
          retrievedDocuments,
          queryId,
          guardrailDecision: {
            isAnswerable: retrievalResult.isAnswerable,
            confidence: retrievalResult.guardrailDecision.score?.confidence || 0,
            threshold: retrievalResult.guardrailDecision.threshold,
            scoreStats: retrievalResult.guardrailDecision.score?.scoreStats ? {
              mean: retrievalResult.guardrailDecision.score.scoreStats.mean,
              max: retrievalResult.guardrailDecision.score.scoreStats.max,
              min: retrievalResult.guardrailDecision.score.scoreStats.min,
              stdDev: retrievalResult.guardrailDecision.score.scoreStats.stdDev,
              count: retrievalResult.guardrailDecision.score.scoreStats.count
            } : undefined,
            algorithmScores: retrievalResult.guardrailDecision.score?.algorithmScores,
            sourceAwareConfidence: retrievalResult.guardrailDecision.score?.sourceAwareConfidence
          },
          freshnessStats: synthesisResponse.freshnessStats,
          citations: responseCitations,
          ...(includeMetrics && {
            metrics: {
              totalDuration: requestDuration,
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
              rerankingEnabled: retrievalResult.metrics.rerankingEnabled,
              sectionCompletionMetrics: retrievalResult.sectionCompletionMetrics || { // Direct from GuardedRetrievalResult
                sectionsDetected: 0, sectionsCompleted: 0, sectionsReconstructed: 0,
                totalAdditionalChunks: 0, completionDuration: 0, timeoutOccurred: false
              }
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
        const totalLatency = performance.now() - startTime;

        // Enhanced audit log for errors with required fields
        fastify.log.error({
          audit: true,
          tenant: userContext.tenantId || 'default',
          qHash,
          k: k || 10,
          rrfUsed: hybridSearch?.rrfK ?? 60,
          rerankerUsed: false, // Assume false on error
          idk: false,
          latencyMs: Math.round(totalLatency),
          route: '/ask',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        }, 'Ask request failed');

        // Log error using audit logger
        auditLogger.logError(
          '/ask',
          userContext.tenantId || 'default',
          qHash, // Use query hash for consistency
          'pipeline',
          (error as Error).message,
          (request as any).ip,
          (request as any).ip // useAgent parameter
        );

        // Check if it's a timeout error
        if ((error as Error).message.includes('timeout') || (error as Error).message.includes('Request timeout')) {
          return reply.status(408).send({
            error: 'Request Timeout',
            message: 'The request took too long to process. Please try again with a simpler query.',
            queryId,
            timeoutStage: (error as Error).message.includes('Overall') ? 'overall' :
                         (error as Error).message.includes('Vector') ? 'vector_search' :
                         (error as Error).message.includes('Keyword') ? 'keyword_search' :
                         (error as Error).message.includes('Reranker') ? 'reranker' :
                         (error as Error).message.includes('LLM') ? 'llm' : 'unknown'
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