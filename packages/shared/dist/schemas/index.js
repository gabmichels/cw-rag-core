import { z } from 'zod';
export const TenantIdSchema = z.string().uuid();
export const DocumentMetadataSchema = z.object({
    tenantId: TenantIdSchema,
    docId: z.string(),
    version: z.string().optional(),
    url: z.string().url().optional(),
    filepath: z.string().optional(),
    authors: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    acl: z.array(z.string()),
}).catchall(z.unknown()); // Allow arbitrary additional metadata fields
export const DocumentSchema = z.object({
    id: z.string(),
    content: z.string(),
    metadata: DocumentMetadataSchema,
});
export const IngestDocumentRequestSchema = z.object({
    documents: z.array(DocumentSchema.omit({ id: true })),
});
export const IngestDocumentResponseSchema = z.object({
    success: z.boolean(),
    documentIds: z.array(z.string()),
    failedDocuments: z.array(z.object({
        document: DocumentSchema.omit({ id: true }),
        error: z.string(),
    })).optional(),
});
export const UserIdSchema = z.string();
export const GroupIdSchema = z.string();
export const UserContextSchema = z.object({
    id: UserIdSchema,
    groupIds: z.array(GroupIdSchema),
    tenantId: TenantIdSchema,
});
export const RetrievedDocumentSchema = z.object({
    document: DocumentSchema,
    score: z.number(),
});
export const AskRequestSchema = z.object({
    query: z.string(),
    userContext: UserContextSchema,
    k: z.number().int().positive().optional(),
    filter: z.record(z.any()).optional(),
});
export const AskResponseSchema = z.object({
    answer: z.string(),
    retrievedDocuments: z.array(RetrievedDocumentSchema),
    queryId: z.string(),
});
// Normalized Document Schemas
/**
 * Schema for normalized document metadata.
 * Validates all required and optional fields for document metadata.
 */
export const NormalizedMetaSchema = z.object({
    /** Tenant identifier for multi-tenancy support */
    tenant: z.string().min(1),
    /** Unique document identifier within the tenant */
    docId: z.string().min(1),
    /** Source system or origin of the document */
    source: z.string().min(1),
    /** Optional path to the document in the source system */
    path: z.string().optional(),
    /** Optional human-readable title of the document */
    title: z.string().optional(),
    /** Optional language code (ISO 639-1 format) */
    lang: z.string().regex(/^[a-z]{2}$/).optional(),
    /** Optional version identifier for document versioning */
    version: z.string().optional(),
    /** SHA256 hash of the document content (64 hex characters) */
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    /** Access Control List - array of user/group identifiers */
    acl: z.array(z.string().min(1)),
    /** Optional array of document authors */
    authors: z.array(z.string()).optional(),
    /** Optional array of tags or keywords */
    tags: z.array(z.string()).optional(),
    /** ISO 8601 timestamp when document was first ingested */
    timestamp: z.string().datetime(),
    /** Optional ISO 8601 timestamp of last modification */
    modifiedAt: z.string().datetime().optional(),
    /** Optional soft delete flag */
    deleted: z.boolean().optional(),
});
/**
 * Schema for content blocks within a normalized document.
 * Validates block type and optional content fields.
 */
export const BlockSchema = z.object({
    /** Type of content block */
    type: z.enum(['text', 'table', 'code', 'image-ref']),
    /** Optional plain text content */
    text: z.string().optional(),
    /** Optional HTML representation */
    html: z.string().optional(),
});
/**
 * Schema for complete normalized document structure.
 * Contains validated metadata and array of content blocks.
 */
export const NormalizedDocSchema = z.object({
    /** Document metadata */
    meta: NormalizedMetaSchema,
    /** Array of content blocks */
    blocks: z.array(BlockSchema),
});
