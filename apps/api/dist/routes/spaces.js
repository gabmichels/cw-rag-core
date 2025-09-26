import { SpaceResolver } from '@cw-rag-core/shared';
const spaceResolver = new SpaceResolver();
export async function spacesRoute(fastify) {
    fastify.post('/spaces/resolve', async (request, reply) => {
        const body = request.body;
        if (!body.tenantId || !body.text) {
            return reply.status(400).send({ error: 'tenantId and text are required' });
        }
        try {
            const result = await spaceResolver.resolveSpace(body);
            return reply.status(200).send(result);
        }
        catch (error) {
            console.error('Space resolution error:', error);
            return reply.status(500).send({ error: 'Internal server error' });
        }
    });
}
