import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { pino } from 'pino';
import { FastifyReply, FastifyRequest} from 'fastify'; // Import all necessary Fastify types explicitly from stub
import { QdrantClient } from '@qdrant/js-client-rest';
import 'dotenv/config';

import { healthzRoute } from './routes/healthz.js';
import { readyzRoute } from './routes/readyz.js';
import { ingestNormalizeRoute } from './routes/ingestNormalize.js';
import { askRoute } from './routes/ask.js';
import { askStreamRoute } from './routes/ask-stream.js';
import { ingestRoutes } from './routes/ingest/index.js';
import { DOCUMENT_VECTOR_DIMENSION } from '@cw-rag-core/shared';
import { BgeSmallEnV15EmbeddingService } from '@cw-rag-core/retrieval';

const PORT = parseInt(process.env.PORT || '3000', 10);
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION_NAME = 'docs_v1';
const INGEST_TOKEN = process.env.INGEST_TOKEN;

// Security configuration
const ALLOWED_ORIGINS = [
  'http://localhost:3001', // Web frontend
  'http://localhost:5678'  // N8N automation
];

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
  } : undefined,
});

const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

const embeddingService = new BgeSmallEnV15EmbeddingService();

async function bootstrapQdrant(maxRetries = 5, retryDelay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info(`Attempt ${i + 1} to connect to Qdrant and bootstrap collection...`);
      const collections = await qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (c) => c.name === QDRANT_COLLECTION_NAME
      );

      if (!collectionExists) {
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' not found, creating...`);
        await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
          vectors: { size: DOCUMENT_VECTOR_DIMENSION, distance: 'Cosine' },
        });
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' created.`);

        logger.info(`Creating payload indexes for '${QDRANT_COLLECTION_NAME}'...`);
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'tenant', field_schema: 'keyword', wait: true });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'docId', field_schema: 'keyword', wait: true });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'acl', field_schema: 'keyword', wait: true });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'lang', field_schema: 'keyword', wait: true });
        logger.info('Payload indexes created successfully.');
      } else {
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' already exists.`);
      }
      logger.info('Qdrant bootstrap complete.');
      return;
    } catch (error) {
      logger.error(`Failed to connect to Qdrant or bootstrap collection: ${(error as Error).message}`);
      if (i < maxRetries - 1) {
        logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw new Error('Max Qdrant connection retries reached. Exiting.');
      }
    }
  }
}

async function startServer() {
  const server = Fastify({
    logger: process.env.NODE_ENV === 'production' ? true : {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
        },
      },
    }
  });

  // Validate required environment variables
  if (!INGEST_TOKEN) {
    throw new Error('INGEST_TOKEN environment variable is required for security');
  }

  // Security headers middleware
  server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    // Content Security Policy
    (reply as any).header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");

    // Anti-clickjacking
    (reply as any).header('X-Frame-Options', 'DENY');

    // Content type sniffing protection
    (reply as any).header('X-Content-Type-Options', 'nosniff');

    // Referrer policy
    (reply as any).header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // XSS protection (legacy but still useful)
    (reply as any).header('X-XSS-Protection', '1; mode=block');

    // Rate limiting headers (if not already set by rate limiter)
    if (!(reply as any).getHeader('X-RateLimit-Limit')) {
      (reply as any).header('X-Rate-Limit-Policy', 'ingest: 60 requests per minute');
    }

    return payload;
  });

  // CORS configuration with allowlist
  await server.register(cors, {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      // Allow requests with no origin (like Postman, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      // Log blocked origins for security monitoring
      logger.warn(`CORS request blocked from unauthorized origin: ${origin}`, {
        event: 'cors_blocked',
        origin,
        timestamp: new Date().toISOString()
      });

      callback(new Error('CORS: Origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-ingest-token', 'x-tenant']
  });

  // Note: Rate limiting is handled per-route to avoid conflicts
  // Ingest routes: 60 req/min, Ask routes: have their own limits

  // Register routes
  server.register(healthzRoute);
  server.register(readyzRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME });
  server.register(ingestNormalizeRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME, embeddingService });
  server.register(askRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME, embeddingService });
  server.register(askStreamRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME, embeddingService });
  server.register(ingestRoutes, {
    qdrantClient,
    collectionName: QDRANT_COLLECTION_NAME,
    ingestToken: INGEST_TOKEN
  });

  // Security event logging
  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Log ingest endpoint access attempts
    if ((request as any).url?.startsWith('/ingest')) {
      logger.info('Ingest endpoint access attempt', {
        event: 'ingest_access_attempt',
        method: (request as any).method,
        url: (request as any).url,
        ip: (request as any).ip,
        userAgent: (request.headers as any)['user-agent'],
        hasToken: !!(request.headers as any)['x-ingest-token'],
        timestamp: new Date().toISOString()
      });
    }
  });

  // Error handling for security events
  (server as any).setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
    logger.error('Request processing error', {
      event: 'request_error',
      error: error.message,
      statusCode: error.statusCode || 500,
      method: (request as any).method,
      url: (request as any).url,
      ip: (request as any).ip,
      timestamp: new Date().toISOString()
    });

    // Don't expose internal error details in production
    if (process.env.NODE_ENV === 'production') {
      reply.status(error.statusCode || 500).send({
        error: 'Internal Server Error',
        message: 'An error occurred processing your request',
        code: 'INTERNAL_ERROR'
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: error.name || 'Internal Server Error',
        message: error.message,
        code: error.code || 'INTERNAL_ERROR'
      });
    }
  });

  try {
    await bootstrapQdrant();
    await server.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`Secure server listening on http://0.0.0.0:${PORT}`, {
      event: 'server_started',
      port: PORT,
      corsOrigins: ALLOWED_ORIGINS,
      securityFeatures: [
        'CORS allowlist',
        'Rate limiting',
        'Security headers',
        'Token authentication',
        'Structured logging'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Failed to start server', {
      event: 'server_startup_failed',
      error: (err as Error).message,
      stack: (err as Error).stack,
      name: (err as Error).name,
      timestamp: new Date().toISOString()
    });
    console.error('Full error details:', err);
    process.exit(1);
  }
}

startServer();