import Fastify from 'fastify';
import 'dotenv/config';
const PORT = parseInt(process.env.PORT || '3000', 10);
const INGEST_TOKEN = process.env.INGEST_TOKEN;
console.log('Environment check:');
console.log('PORT:', PORT);
console.log('INGEST_TOKEN:', INGEST_TOKEN ? 'SET' : 'NOT SET');
async function startMinimalServer() {
    const server = Fastify({
        logger: true
    });
    // Validate required environment variables
    if (!INGEST_TOKEN) {
        throw new Error('INGEST_TOKEN environment variable is required for security');
    }
    // Simple health check route
    server.get('/healthz', async (request, reply) => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    try {
        console.log('Starting minimal server...');
        await server.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`✅ Minimal server listening on http://0.0.0.0:${PORT}`);
    }
    catch (err) {
        console.error('❌ Failed to start minimal server:', err);
        console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            name: err.name
        });
        process.exit(1);
    }
}
startMinimalServer();
