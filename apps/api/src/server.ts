import Fastify from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';
import { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from 'fastify'; // Import all necessary Fastify types explicitly from stub
import { FastifyBaseLogger } from 'pino';
import { CollectionInfo, PointStruct, QdrantClient, SearchParams } from '@qdrant/js-client-rest';
import 'dotenv/config';

import { healthzRoute } from './routes/healthz.js';
import { readyzRoute } from './routes/readyz.js';
import { ingestNormalizeRoute } from './routes/ingestNormalize.js';
import { askRoute } from './routes/ask.js';
import { DOCUMENT_VECTOR_DIMENSION } from '@cw-rag-core/shared';

const PORT = parseInt(process.env.PORT || '3000', 10);
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION_NAME = 'docs_v1';

const createLogger = () => pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
  },
});

const logger = createLogger();

const qdrantClient = new QdrantClient({
  host: QDRANT_URL.replace(/https?:\/\//, ''),
  apiKey: QDRANT_API_KEY,
});

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
  const server = Fastify({ logger });

  await server.register(cors, {
    origin: '*',
  });

  server.register(healthzRoute);
  server.register(readyzRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME });
  server.register(ingestNormalizeRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME });
  server.register(askRoute, { qdrantClient, collectionName: QDRANT_COLLECTION_NAME });

  try {
    await bootstrapQdrant();
    await server.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`Server listening on http://0.0.0.0:${PORT}`);
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}

startServer();