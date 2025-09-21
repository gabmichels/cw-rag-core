import Fastify from 'fastify';

console.log('Creating Fastify instance...');
const server = Fastify({ logger: true });

console.log('Registering simple route...');
server.get('/test', async (request, reply) => {
  return { status: 'ok', test: true };
});

console.log('Starting server on port 3000...');
try {
  await server.listen({ port: 3000, host: '0.0.0.0' });
  console.log('Server started successfully!');
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}