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
