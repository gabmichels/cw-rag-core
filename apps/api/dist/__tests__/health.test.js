import Fastify from 'fastify';
import { healthzRoute } from '../routes/healthz.js';
describe('Health Check - /healthz', () => {
    const server = Fastify();
    server.register(healthzRoute);
    afterAll(async () => {
        await server.close();
    });
    const runHealthzTest = async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/healthz',
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    };
    test('should return 200 with status ok for /healthz', async () => {
        await runHealthzTest();
    });
});
