import { FastifyInstance, FastifyRequest } from 'fastify';
import { NormalizedDoc } from '@cw-rag-core/shared';
import { AuditLogger } from '../../utils/audit.js';
interface UploadRouteOptions {
    auditLogger: AuditLogger;
    previewHandler: (docs: NormalizedDoc[], request: FastifyRequest) => Promise<any>;
    publishHandler: (docs: NormalizedDoc[], request: FastifyRequest) => Promise<any>;
}
export declare function uploadRoute(fastify: FastifyInstance, options: UploadRouteOptions): Promise<void>;
export {};
