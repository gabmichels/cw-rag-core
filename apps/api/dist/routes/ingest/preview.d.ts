import { FastifyInstance } from 'fastify';
import { AuditLogger } from '../../utils/audit.js';
interface PreviewRouteOptions {
    auditLogger: AuditLogger;
    ingestToken: string;
}
export declare function previewRoute(fastify: FastifyInstance, options: PreviewRouteOptions): Promise<void>;
export {};
