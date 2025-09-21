/**
 * Audit logger for ingestion operations
 */
export class AuditLogger {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Log an audit entry
     * Uses structured logging that can be consumed by log aggregation systems
     */
    logEntry(entry) {
        // Use structured logging with specific audit level
        this.logger.info(`Ingestion audit: ${entry.action} ${entry.docId} for tenant ${entry.tenant}`, {
            audit: true,
            ...entry
        });
    }
    /**
     * Log a successful publish operation
     */
    logPublish(tenant, docId, version, source, findingsSummary, ip, userAgent) {
        this.logEntry({
            ts: new Date().toISOString(),
            route: '/ingest/publish',
            tenant,
            docId,
            version,
            source,
            action: 'publish',
            findingsSummary,
            status: 'success',
            ip,
            userAgent
        });
    }
    /**
     * Log a blocked operation due to PII policy
     */
    logBlock(tenant, docId, version, source, findingsSummary, ip, userAgent) {
        this.logEntry({
            ts: new Date().toISOString(),
            route: '/ingest/publish',
            tenant,
            docId,
            version,
            source,
            action: 'block',
            findingsSummary,
            status: 'blocked',
            ip,
            userAgent
        });
    }
    /**
     * Log a tombstone operation (document deletion)
     */
    logTombstone(tenant, docId, source, ip, userAgent) {
        this.logEntry({
            ts: new Date().toISOString(),
            route: '/ingest/publish',
            tenant,
            docId,
            source,
            action: 'tombstone',
            findingsSummary: [],
            status: 'success',
            ip,
            userAgent
        });
    }
    /**
     * Log a preview operation
     */
    logPreview(tenant, docId, version, source, findingsSummary, wouldPublish, ip, userAgent) {
        this.logEntry({
            ts: new Date().toISOString(),
            route: '/ingest/preview',
            tenant,
            docId,
            version,
            source,
            action: 'preview',
            findingsSummary,
            status: wouldPublish ? 'success' : 'blocked',
            ip,
            userAgent
        });
    }
    /**
     * Log an error during ingestion
     */
    logError(route, tenant, docId, source, error, ip, userAgent) {
        this.logEntry({
            ts: new Date().toISOString(),
            route,
            tenant,
            docId,
            source,
            action: 'skip',
            findingsSummary: [],
            status: 'error',
            error,
            ip,
            userAgent
        });
    }
}
/**
 * Create an audit logger instance
 */
export function createAuditLogger(logger) {
    return new AuditLogger(logger);
}
