declare module 'fastify' {
    import { IncomingMessage, ServerResponse } from 'http';
    import { FastifyLoggerInstance, FastifyBaseLogger } from 'pino'; // Now FastifyBaseLogger is exported from pino stub

    interface FastifyRequest<RouteGeneric extends { Body?: unknown; Querystring?: unknown; Params?: unknown; Headers?: unknown; } = { Body?: unknown; Querystring?: unknown; Params?: unknown; Headers?: unknown; }> {
        body: RouteGeneric['Body'];
        query: RouteGeneric['Querystring'];
        params: RouteGeneric['Params'];
        headers: RouteGeneric['Headers'];
        log: FastifyLoggerInstance;
    }

    interface FastifyReply {
        code(statusCode: number): FastifyReply;
        status(statusCode: number): FastifyReply;
        send(payload?: unknown): FastifyReply;
    }

    interface FastifyInstance {
        addHook: any;
        register: any;
        listen: any;
        log: FastifyLoggerInstance;
        get: (path: string, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any> | any) => void;
        post: (path: string, opts: { schema: any, handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any> | any }) => void;
        inject: (opts: { method: string; url: string; payload?: any; headers?: { [key: string]: string } }) => Promise<{ statusCode: number; json: () => any }>;
        close: () => Promise<void>;
    }

    interface FastifyPluginAsync<Options extends object = Record<never, never>> {
        (
            fastify: FastifyInstance,
            options: Options,
            done: (err?: Error) => void
        ): Promise<void>;
    }

    interface FastifyServerOptions<Logger = FastifyBaseLogger> {
        logger?: Logger | boolean;
    }

    function fastify(opts?: FastifyServerOptions): FastifyInstance;
    export default fastify;
    export { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync, FastifyServerOptions };
}