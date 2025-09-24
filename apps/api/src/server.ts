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
import { documentFetchRoute } from './routes/document-fetch.js'; // Added import for new route
import { ingestRoutes } from './routes/ingest/index.js';
import { DOCUMENT_VECTOR_DIMENSION } from '@cw-rag-core/shared';
import { BgeSmallEnV15EmbeddingService } from '@cw-rag-core/retrieval';
import { bootstrapQdrant as comprehensiveBootstrapQdrant, QDRANT_COLLECTION_NAME } from './services/qdrant.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
// QDRANT_COLLECTION_NAME is now imported from services/qdrant.js to ensure consistency
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

// Bootstrap function is now imported from services/qdrant.js for better consistency and maintenance

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
  server.register(documentFetchRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME }); // Register new document fetch route
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
    // Use the comprehensive bootstrap function with enhanced logging
    server.log.info('Starting comprehensive Qdrant bootstrap process...');
    await comprehensiveBootstrapQdrant(qdrantClient, server.log);
    server.log.info('Comprehensive Qdrant bootstrap completed successfully.');
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