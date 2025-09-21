/**
 * Normalized document types for the CW RAG Core system.
 * These types define the contract for normalized documents after ingestion.
 */

/**
 * Metadata for a normalized document.
 * Contains all necessary information to identify, version, and control access to the document.
 */
export interface NormalizedMeta {
  /** Tenant identifier for multi-tenancy support */
  tenant: string;

  /** Unique document identifier within the tenant */
  docId: string;

  /** Source system or origin of the document */
  source: string;

  /** Optional path to the document in the source system */
  path?: string;

  /** Optional human-readable title of the document */
  title?: string;

  /** Optional language code (ISO 639-1 format, e.g., 'en', 'es') */
  lang?: string;

  /** Optional version identifier for document versioning */
  version?: string;

  /** SHA256 hash of the document content for integrity verification */
  sha256: string;

  /** Access Control List - array of user/group identifiers with access */
  acl: string[];

  /** Optional array of document authors */
  authors?: string[];

  /** Optional array of tags or keywords for categorization */
  tags?: string[];

  /** Timestamp when the document was first ingested (ISO 8601 format) */
  timestamp: string;

  /** Optional timestamp of last modification (ISO 8601 format) */
  modifiedAt?: string;

  /** Optional flag indicating if the document is deleted (soft delete) */
  deleted?: boolean;
}

/**
 * Individual content block within a normalized document.
 * Supports various content types with optional text and HTML representations.
 */
export interface Block {
  /** Type of content block */
  type: 'text' | 'table' | 'code' | 'image-ref';

  /** Optional plain text content */
  text?: string;

  /** Optional HTML representation of the content */
  html?: string;
}

/**
 * Complete normalized document structure.
 * Contains metadata and an array of content blocks.
 */
export interface NormalizedDoc {
  /** Document metadata */
  meta: NormalizedMeta;

  /** Array of content blocks that make up the document */
  blocks: Block[];
}