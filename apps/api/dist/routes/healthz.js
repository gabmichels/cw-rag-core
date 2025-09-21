export async function healthzRoute(fastify) {
    fastify.get('/healthz', async (request, reply) => {
        return reply.status(200).send({ status: 'ok' });
    });
}
