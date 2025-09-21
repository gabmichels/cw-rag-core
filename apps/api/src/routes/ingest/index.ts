import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createAuditLogger } from '../../utils/audit.js';
import { previewRoute } from './preview.js';
import { publishRoute } from './publish.js';
import { uploadRoute } from './upload.js';

interface IngestRouteOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
}

export async function ingestRoutes(fastify: FastifyInstance, options: IngestRouteOptions) {
  const INGEST_TOKEN = process.env.INGEST_TOKEN;

  if (!INGEST_TOKEN) {
    throw new Error('INGEST_TOKEN environment variable is required');
  }

  // Create audit logger
  const auditLogger = createAuditLogger(fastify.log);

  // Register rate limiting for all /ingest/* routes
  await fastify.register(require('@fastify/rate-limit'), {
    max: 100, // 100 requests per minute per IP
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      // Rate limit by IP + tenant if available
      const ip = (request as any).ip || 'unknown';
      const tenant = (request.headers as any)['x-tenant'] || 'default';
      return `${ip}:${tenant}`;
    },
    errorResponseBuilder: (request: FastifyRequest, context: any) => {
      return {
        error: 'Rate Limit Exceeded',
        message: `Too many requests from this IP. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
        retryAfter: Math.round(context.ttl / 1000)
      };
    },
    onExceeding: (request: FastifyRequest) => {
      fastify.log.warn(`Rate limit exceeded for IP: ${(request as any).ip || 'unknown'}`);
    }
  });

  // Helper function to handle preview logic (shared between preview and upload)
  const handlePreview = async (docs: any[], request: FastifyRequest) => {
    // This would normally call the preview endpoint logic
    // For now, simplified implementation
    let totalBytes = 0;
    let totalBlocks = 0;
    const allFindings: any[] = [];

    for (const doc of docs) {
      totalBytes += JSON.stringify(doc).length;
      totalBlocks += doc.blocks?.length || 0;
    }

    return {
      wouldPublish: true,
      findings: allFindings,
      bytes: totalBytes,
      blocksCount: totalBlocks,
      processedDocs: docs.length
    };
  };

  // Helper function to handle publish logic (shared between publish and upload)
  const handlePublish = async (docs: any[], request: FastifyRequest) => {
    // This would normally call the publish endpoint logic
    // For now, simplified implementation
    const results = docs.map(doc => ({
      docId: doc.meta?.docId || 'unknown',
      status: 'published',
      pointsUpserted: doc.blocks?.length || 1,
      findings: []
    }));

    const summary = {
      total: docs.length,
      published: docs.length,
      updated: 0,
      blocked: 0,
      deleted: 0,
      errors: 0
    };

    return { results, summary };
  };

  // Register individual route handlers
  await fastify.register(async function(fastify: FastifyInstance) {
    await previewRoute(fastify, {
      auditLogger,
      ingestToken: INGEST_TOKEN
    });
  }, { prefix: '/ingest' });

  await fastify.register(async function(fastify: FastifyInstance) {
    await publishRoute(fastify, {
      qdrantClient: options.qdrantClient,
      collectionName: options.collectionName,
      auditLogger,
      ingestToken: INGEST_TOKEN
    });
  }, { prefix: '/ingest' });

  await fastify.register(async function(fastify: FastifyInstance) {
    await uploadRoute(fastify, {
      auditLogger,
      ingestToken: INGEST_TOKEN,
      previewHandler: handlePreview,
      publishHandler: handlePublish
    });
  }, { prefix: '/ingest' });

  // Add a general ingest info endpoint
  fastify.get('/ingest', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      service: 'CW RAG Core Ingestion API',
      version: '1.0.0',
      endpoints: [
        {
          path: '/ingest/preview',
          method: 'POST',
          description: 'Preview documents for ingestion without persisting'
        },
        {
          path: '/ingest/publish',
          method: 'POST',
          description: 'Publish documents to the vector database'
        },
        {
          path: '/ingest/upload',
          method: 'POST',
          description: 'Upload files for conversion and optional publishing'
        }
      ],
      authentication: 'x-ingest-token header required',
      rateLimit: '100 requests per minute per IP',
      supportedFileTypes: ['pdf', 'docx', 'md', 'html', 'txt'],
      maxFileSize: '10MB'
    });
  });

  fastify.log.info('Ingest routes registered successfully');
}