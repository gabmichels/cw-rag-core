import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SpaceResolver, SpaceResolutionInput } from '@cw-rag-core/shared';

const spaceResolver = new SpaceResolver();

export async function spacesRoute(fastify: FastifyInstance) {
  fastify.post('/spaces/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SpaceResolutionInput;

    if (!body.tenantId || !body.text) {
      return reply.status(400).send({ error: 'tenantId and text are required' });
    }

    try {
      const result = await spaceResolver.resolveSpace(body);
      return reply.status(200).send(result);
    } catch (error) {
      console.error('Space resolution error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}