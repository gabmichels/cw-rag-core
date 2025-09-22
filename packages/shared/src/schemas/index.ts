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

// Removed - will be redefined below with enhanced fields

export const AskRequestSchema = z.object({
  query: z.string(),
  userContext: UserContextSchema,
  k: z.number().int().positive().optional(),
  filter: z.record(z.any()).optional(),

  // Hybrid search configuration
  hybridSearch: z.object({
    vectorWeight: z.number().min(0).max(1).optional(),
    keywordWeight: z.number().min(0).max(1).optional(),
    rrfK: z.number().int().positive().optional(),
    enableKeywordSearch: z.boolean().optional(),
  }).optional(),

  // Reranker configuration
  reranker: z.object({
    enabled: z.boolean().optional(),
    model: z.string().optional(),
    topK: z.number().int().positive().optional(),
  }).optional(),

  // Answer synthesis options
  synthesis: z.object({
    maxContextLength: z.number().int().positive().optional(),
    includeCitations: z.boolean().optional(),
    answerFormat: z.enum(['markdown', 'plain']).optional(),
  }).optional(),

  // Performance and debugging options
  includeMetrics: z.boolean().optional(),
  includeDebugInfo: z.boolean().optional(),
});

export const EnhancedRetrievedDocumentSchema = z.object({
  document: DocumentSchema,
  score: z.number(),
  freshness: z.object({
    category: z.enum(['Fresh', 'Recent', 'Stale']),
    badge: z.string(),
    humanReadable: z.string(),
    ageInDays: z.number(),
  }).optional(),

  // Enhanced retrieval metadata
  searchType: z.enum(['hybrid', 'vector_only', 'keyword_only']).optional(),
  vectorScore: z.number().optional(),
  keywordScore: z.number().optional(),
  fusionScore: z.number().optional(),
  rerankerScore: z.number().optional(),
  rank: z.number().int().positive().optional(),
});

export const GuardrailDecisionSchema = z.object({
  isAnswerable: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  scoreStats: z.object({
    mean: z.number(),
    max: z.number(),
    min: z.number(),
    stdDev: z.number(),
    count: z.number().int().nonnegative(),
  }).optional(),
  algorithmScores: z.object({
    statistical: z.number(),
    threshold: z.number(),
    mlFeatures: z.number(),
    rerankerConfidence: z.number().optional(),
  }).optional(),
});

export const AskResponseSchema = z.object({
  answer: z.string(),
  retrievedDocuments: z.array(EnhancedRetrievedDocumentSchema),
  queryId: z.string(),

  // Guardrail decision with enhanced metadata
  guardrailDecision: GuardrailDecisionSchema.optional(),

  // Enhanced citation and freshness information
  freshnessStats: z.object({
    totalDocuments: z.number().int().nonnegative(),
    freshPercentage: z.number().min(0).max(100),
    recentPercentage: z.number().min(0).max(100),
    stalePercentage: z.number().min(0).max(100),
    avgAgeInDays: z.number().nonnegative(),
  }).optional(),
  citations: z.array(z.object({
    id: z.string(),
    number: z.number().int().positive(),
    source: z.string(),
    freshness: z.object({
      category: z.enum(['Fresh', 'Recent', 'Stale']),
      badge: z.string(),
      humanReadable: z.string(),
      ageInDays: z.number(),
    }).optional(),
    docId: z.string().optional(),
    version: z.string().optional(),
    url: z.string().url().optional(),
    filepath: z.string().optional(),
    authors: z.array(z.string()).optional(),
  })).optional(),

  // Performance metrics
  metrics: z.object({
    totalDuration: z.number().nonnegative(),
    vectorSearchDuration: z.number().nonnegative().optional(),
    keywordSearchDuration: z.number().nonnegative().optional(),
    fusionDuration: z.number().nonnegative().optional(),
    rerankerDuration: z.number().nonnegative().optional(),
    guardrailDuration: z.number().nonnegative().optional(),
    synthesisTime: z.number().nonnegative().optional(),
    vectorResultCount: z.number().int().nonnegative().optional(),
    keywordResultCount: z.number().int().nonnegative().optional(),
    finalResultCount: z.number().int().nonnegative().optional(),
    documentsReranked: z.number().int().nonnegative().optional(),
    rerankingEnabled: z.boolean().optional(),
  }).optional(),

  // Synthesis metadata
  synthesisMetadata: z.object({
    tokensUsed: z.number().int().nonnegative(),
    modelUsed: z.string(),
    contextTruncated: z.boolean(),
    confidence: z.number().min(0).max(1),
    llmProvider: z.string().optional(),
  }).optional(),

  // Debug information (optional)
  debug: z.object({
    hybridSearchConfig: z.record(z.any()).optional(),
    rerankerConfig: z.record(z.any()).optional(),
    guardrailConfig: z.record(z.any()).optional(),
    retrievalSteps: z.array(z.string()).optional(),
  }).optional(),
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
