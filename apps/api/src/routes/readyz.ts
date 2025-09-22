import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';

interface ReadyzOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
}

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}

interface DependencyHealth {
  qdrant: HealthCheckResult;
  embeddings: HealthCheckResult;
  reranker: HealthCheckResult;
  llm: HealthCheckResult;
}

export async function readyzRoute(fastify: FastifyInstance, options: ReadyzOptions) {
  fastify.get('/readyz', async (request: FastifyRequest, reply: FastifyReply) => {
    const healthChecks: DependencyHealth = {
      qdrant: { status: 'unhealthy' },
      embeddings: { status: 'unhealthy' },
      reranker: { status: 'unhealthy' },
      llm: { status: 'unhealthy' }
    };

    let overallHealthy = true;
    let hasDegradedServices = false;

    try {
      // Check Qdrant health with timeout
      const qdrantStartTime = performance.now();
      try {
        const qdrantPromise = options.qdrantClient.getCollections();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Qdrant health check timeout')), 5000);
        });

        const collections = await Promise.race([qdrantPromise, timeoutPromise]);
        const collectionExists = collections.collections.some(c => c.name === options.collectionName);

        healthChecks.qdrant = {
          status: collectionExists ? 'healthy' : 'degraded',
          latency: Math.round(performance.now() - qdrantStartTime)
        };

        if (!collectionExists) {
          healthChecks.qdrant.error = 'collection not found or not bootstrapped';
          hasDegradedServices = true;
        }
      } catch (error) {
        healthChecks.qdrant = {
          status: 'unhealthy',
          latency: Math.round(performance.now() - qdrantStartTime),
          error: (error as Error).message
        };
        overallHealthy = false;
      }

      // Check embeddings service health
      const embeddingsStartTime = performance.now();
      try {
        const embeddingsUrl = process.env.EMBEDDINGS_URL || 'http://localhost:8080';
        const embeddingHealthUrl = `${embeddingsUrl}/health`;

        const embeddingResponse = await Promise.race([
          fetch(embeddingHealthUrl, { method: 'GET' }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Embeddings health check timeout')), 3000);
          })
        ]);

        if (embeddingResponse.ok) {
          healthChecks.embeddings = {
            status: 'healthy',
            latency: Math.round(performance.now() - embeddingsStartTime)
          };
        } else {
          healthChecks.embeddings = {
            status: 'degraded',
            latency: Math.round(performance.now() - embeddingsStartTime),
            error: `HTTP ${embeddingResponse.status}`
          };
          hasDegradedServices = true;
        }
      } catch (error) {
        healthChecks.embeddings = {
          status: 'unhealthy',
          latency: Math.round(performance.now() - embeddingsStartTime),
          error: (error as Error).message
        };
        overallHealthy = false;
      }

      // Check reranker service health (optional)
      const rerankerStartTime = performance.now();
      try {
        const rerankerUrl = process.env.RERANKER_URL;
        if (rerankerUrl) {
          const rerankerHealthUrl = `${rerankerUrl}/health`;

          const rerankerResponse = await Promise.race([
            fetch(rerankerHealthUrl, { method: 'GET' }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Reranker health check timeout')), 3000);
            })
          ]);

          if (rerankerResponse.ok) {
            healthChecks.reranker = {
              status: 'healthy',
              latency: Math.round(performance.now() - rerankerStartTime)
            };
          } else {
            healthChecks.reranker = {
              status: 'degraded',
              latency: Math.round(performance.now() - rerankerStartTime),
              error: `HTTP ${rerankerResponse.status}`
            };
            hasDegradedServices = true;
          }
        } else {
          healthChecks.reranker = {
            status: 'healthy', // Optional service, healthy if not configured
            latency: 0
          };
        }
      } catch (error) {
        healthChecks.reranker = {
          status: 'degraded', // Degrade but don't fail overall health
          latency: Math.round(performance.now() - rerankerStartTime),
          error: (error as Error).message
        };
        hasDegradedServices = true;
      }

      // Check LLM service health (optional for some configurations)
      const llmStartTime = performance.now();
      try {
        const llmUrl = process.env.LLM_ENDPOINT;
        if (llmUrl && process.env.LLM_ENABLED === 'true') {
          // Simple connectivity check for LLM endpoint
          const llmHealthUrl = `${llmUrl}/health`;

          const llmResponse = await Promise.race([
            fetch(llmHealthUrl, { method: 'GET' }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('LLM health check timeout')), 3000);
            })
          ]);

          if (llmResponse.ok) {
            healthChecks.llm = {
              status: 'healthy',
              latency: Math.round(performance.now() - llmStartTime)
            };
          } else {
            healthChecks.llm = {
              status: 'degraded',
              latency: Math.round(performance.now() - llmStartTime),
              error: `HTTP ${llmResponse.status}`
            };
            hasDegradedServices = true;
          }
        } else {
          healthChecks.llm = {
            status: 'healthy', // Healthy if LLM is disabled or not configured
            latency: 0
          };
        }
      } catch (error) {
        healthChecks.llm = {
          status: 'degraded', // Degrade but don't fail overall health for LLM issues
          latency: Math.round(performance.now() - llmStartTime),
          error: (error as Error).message
        };
        hasDegradedServices = true;
      }

      // Determine overall status
      const overallStatus = !overallHealthy ? 'not ready' :
                           hasDegradedServices ? 'degraded' : 'ready';

      const statusCode = !overallHealthy ? 503 : 200;

      // Log health check results
      fastify.log.info({
        event: 'health_check',
        endpoint: '/readyz',
        status: overallStatus,
        dependencies: healthChecks,
        timestamp: new Date().toISOString()
      }, `Health check completed - ${overallStatus}`);

      return reply.status(statusCode).send({
        status: overallStatus,
        dependencies: healthChecks,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Catch-all error handling
      fastify.log.error({ error }, '/readyz check failed');
      return reply.status(503).send({
        status: 'not ready',
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
}