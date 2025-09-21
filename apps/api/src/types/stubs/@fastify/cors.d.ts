declare module '@fastify/cors' {
    import { FastifyPluginAsync } from 'fastify';

    interface FastifyCorsOptions {
        origin?: boolean | string | RegExp | (string | RegExp)[];
        methods?: string | string[];
        allowedHeaders?: string | string[];
        exposedHeaders?: string | string[];
        credentials?: boolean;
        preflight?: boolean;
        optionsSuccessStatus?: number;
        maxAge?: number;
    }

    const fastifyCors: FastifyPluginAsync<FastifyCorsOptions>;
    export default fastifyCors;
}