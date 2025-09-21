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
export class AuditLogger {
  private logger: FastifyInstance['log'];

  constructor(logger: FastifyInstance['log']) {
    this.logger = logger;
  }

  /**
   * Log an audit entry
   * Uses structured logging that can be consumed by log aggregation systems
   */
  logEntry(entry: AuditLogEntry): void {
    // Use structured logging with specific audit level
    this.logger.info(
      `Ingestion audit: ${entry.action} ${entry.docId} for tenant ${entry.tenant}`,
      {
        audit: true,
        ...entry
      }
    );
  }

  /**
   * Log a successful publish operation
   */
  logPublish(
    tenant: string,
    docId: string,
    version: string | undefined,
    source: string,
    findingsSummary: RedactionSummary[],
    ip?: string,
    userAgent?: string
  ): void {
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
  logBlock(
    tenant: string,
    docId: string,
    version: string | undefined,
    source: string,
    findingsSummary: RedactionSummary[],
    ip?: string,
    userAgent?: string
  ): void {
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
  logTombstone(
    tenant: string,
    docId: string,
    source: string,
    ip?: string,
    userAgent?: string
  ): void {
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
  logPreview(
    tenant: string,
    docId: string,
    version: string | undefined,
    source: string,
    findingsSummary: RedactionSummary[],
    wouldPublish: boolean,
    ip?: string,
    userAgent?: string
  ): void {
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
  logError(
    route: string,
    tenant: string,
    docId: string,
    source: string,
    error: string,
    ip?: string,
    userAgent?: string
  ): void {
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
export function createAuditLogger(logger: FastifyInstance['log']): AuditLogger {
  return new AuditLogger(logger);
}