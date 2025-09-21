import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthzRoute(fastify: FastifyInstance) {
  fastify.get('/healthz', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok' });
  });
}