import { FastifyInstance } from 'fastify';
/**
 * Summary of redactions performed (never includes raw PII values)
 */
export interface RedactionSummary {
    /** Type of PII and count of redactions */
    type: string;
    /** Number of instances redacted */
    count: number;
}
/**
 * Audit log entry structure for ingestion operations
 */
export interface AuditLogEntry {
    /** Timestamp of the operation */
    ts: string;
    /** API route that was called */
    route: string;
    /** Tenant identifier */
    tenant: string;
    /** Document identifier */
    docId: string;
    /** Document version */
    version?: string;
    /** Source system */
    source: string;
    /** Action performed */
    action: 'publish' | 'skip' | 'tombstone' | 'block' | 'preview';
    /** Summary of PII findings (never raw PII) */
    findingsSummary: RedactionSummary[];
    /** Operation status */
    status: 'success' | 'error' | 'blocked';
    /** Optional error message */
    error?: string;
    /** Request IP address */
    ip?: string;
    /** User agent */
    userAgent?: string;
}
/**
 * Audit logger for ingestion operations
 */
export declare class AuditLogger {
    private logger;
    constructor(logger: FastifyInstance['log']);
    /**
     * Log an audit entry
     * Uses structured logging that can be consumed by log aggregation systems
     */
    logEntry(entry: AuditLogEntry): void;
    /**
     * Log a successful publish operation
     */
    logPublish(tenant: string, docId: string, version: string | undefined, source: string, findingsSummary: RedactionSummary[], ip?: string, userAgent?: string): void;
    /**
     * Log a blocked operation due to PII policy
     */
    logBlock(tenant: string, docId: string, version: string | undefined, source: string, findingsSummary: RedactionSummary[], ip?: string, userAgent?: string): void;
    /**
     * Log a tombstone operation (document deletion)
     */
    logTombstone(tenant: string, docId: string, source: string, ip?: string, userAgent?: string): void;
    /**
     * Log a preview operation
     */
    logPreview(tenant: string, docId: string, version: string | undefined, source: string, findingsSummary: RedactionSummary[], wouldPublish: boolean, ip?: string, userAgent?: string): void;
    /**
     * Log an error during ingestion
     */
    logError(route: string, tenant: string, docId: string, source: string, error: string, ip?: string, userAgent?: string): void;
}
/**
 * Create an audit logger instance
 */
export declare function createAuditLogger(logger: FastifyInstance['log']): AuditLogger;
