import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QdrantClient } from '@qdrant/js-client-rest';

interface ReadyzOptions {
  qdrantClient: QdrantClient;
  collectionName: string;
}

export async function readyzRoute(fastify: FastifyInstance, options: ReadyzOptions) {
  fastify.get('/readyz', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Attempt to get collection info to verify Qdrant connectivity
      // Use getCollections and check for the specific collection
      const collections = await options.qdrantClient.getCollections();
      const collectionExists = collections.collections.some(c => c.name === options.collectionName);

      if (!collectionExists) {
        return reply.status(503).send({ status: 'not ready', qdrant: 'collection not found or not bootstrapped' });
      }

      return reply.status(200).send({ status: 'ok', qdrant: 'connected' });
    } catch (error) {
      // Other errors mean Qdrant connectivity issues
      fastify.log.error({ error }, 'Qdrant /readyz check failed');
      return reply.status(503).send({ status: 'not ready', qdrant: 'not connected', error: (error as Error).message });
    }
  });
}