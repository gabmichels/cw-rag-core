declare module 'pino' {
    export interface Logger {
        info: (msg: string, ...args: any[]) => void;
        error: (msg: string, ...args: any[]) => void;
        warn: (msg: string, ...args: any[]) => void;
        debug: (msg: string, ...args: any[]) => void;
        fatal: (msg: string, ...args: any[]) => void;
        trace: (msg: string, ...args: any[]) => void;
        child: (bindings: object) => Logger;
        level: string;
    }

    type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

    interface LoggerOptions {
        level?: Level | string;
        transport?: {
            target: string;
            options?: Record<string, any>;
        };
        [key: string]: any;
    }

    function pino(options?: LoggerOptions): Logger;
    export default pino;

    export interface FastifyLoggerInstance extends Logger {
        msgPrefix?: string;
    }
    // Re-export Logger as FastifyBaseLogger to match usage in server.ts
    export type FastifyBaseLogger = Logger;
}