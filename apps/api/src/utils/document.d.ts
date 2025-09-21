import { NormalizedDoc } from '@cw-rag-core/shared';
/**
 * Calculate SHA256 hash of document content
 */
export declare function calculateDocumentHash(doc: NormalizedDoc): string;
/**
 * Extract all text content from document blocks for PII detection
 */
export declare function extractCombinedText(doc: NormalizedDoc): string;
/**
 * Calculate document size in bytes
 */
export declare function calculateDocumentSize(doc: NormalizedDoc): number;
/**
 * Count the number of blocks in a document
 */
export declare function countBlocks(doc: NormalizedDoc): number;
/**
 * Validate that required metadata fields are present
 */
export declare function validateDocumentMetadata(doc: NormalizedDoc): string[];
/**
 * Apply PII redaction to document blocks
 */
export declare function applyPIIRedactionToDocument(doc: NormalizedDoc, maskedText: string): NormalizedDoc;
/**
 * Generate a unique point ID for Qdrant
 */
export declare function generatePointId(tenant: string, docId: string, chunkId: string): string;
/**
 * Create chunk metadata payload for Qdrant
 */
export declare function createChunkPayload(doc: NormalizedDoc, chunkId: string, sectionPath?: string): {
    tenant: string;
    docId: string;
    version: string;
    sha256: string;
    acl: string[];
    lang: string;
    source: string;
    path: string | undefined;
    title: string | undefined;
    timestamp: string;
    modifiedAt: string | undefined;
    chunkId: string;
    sectionPath: string | undefined;
    content: string;
};
