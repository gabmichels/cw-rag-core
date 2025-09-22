import { z } from 'zod';
export declare const TenantIdSchema: z.ZodString;
export declare const DocumentMetadataSchema: z.ZodObject<{
    tenantId: z.ZodString;
    docId: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    filepath: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    acl: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodUnknown, z.objectOutputType<{
    tenantId: z.ZodString;
    docId: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    filepath: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    acl: z.ZodArray<z.ZodString, "many">;
}, z.ZodUnknown, "strip">, z.objectInputType<{
    tenantId: z.ZodString;
    docId: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    filepath: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    acl: z.ZodArray<z.ZodString, "many">;
}, z.ZodUnknown, "strip">>;
export declare const DocumentSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    metadata: z.ZodObject<{
        tenantId: z.ZodString;
        docId: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        filepath: z.ZodOptional<z.ZodString>;
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        acl: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodUnknown, z.objectOutputType<{
        tenantId: z.ZodString;
        docId: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        filepath: z.ZodOptional<z.ZodString>;
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        acl: z.ZodArray<z.ZodString, "many">;
    }, z.ZodUnknown, "strip">, z.objectInputType<{
        tenantId: z.ZodString;
        docId: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        filepath: z.ZodOptional<z.ZodString>;
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        acl: z.ZodArray<z.ZodString, "many">;
    }, z.ZodUnknown, "strip">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    content: string;
    metadata: {
        tenantId: string;
        docId: string;
        acl: string[];
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        keywords?: string[] | undefined;
    } & {
        [k: string]: unknown;
    };
}, {
    id: string;
    content: string;
    metadata: {
        tenantId: string;
        docId: string;
        acl: string[];
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        keywords?: string[] | undefined;
    } & {
        [k: string]: unknown;
    };
}>;
export declare const IngestDocumentRequestSchema: z.ZodObject<{
    documents: z.ZodArray<z.ZodObject<Omit<{
        id: z.ZodString;
        content: z.ZodString;
        metadata: z.ZodObject<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, z.ZodUnknown, "strip">>;
    }, "id">, "strip", z.ZodTypeAny, {
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }, {
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    documents: {
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }[];
}, {
    documents: {
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }[];
}>;
export declare const IngestDocumentResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    documentIds: z.ZodArray<z.ZodString, "many">;
    failedDocuments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        document: z.ZodObject<Omit<{
            id: z.ZodString;
            content: z.ZodString;
            metadata: z.ZodObject<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodUnknown, z.objectOutputType<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, z.ZodUnknown, "strip">, z.objectInputType<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, z.ZodUnknown, "strip">>;
        }, "id">, "strip", z.ZodTypeAny, {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        }, {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        }>;
        error: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        document: {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        error: string;
    }, {
        document: {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        error: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    documentIds: string[];
    failedDocuments?: {
        document: {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        error: string;
    }[] | undefined;
}, {
    success: boolean;
    documentIds: string[];
    failedDocuments?: {
        document: {
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        error: string;
    }[] | undefined;
}>;
export declare const UserIdSchema: z.ZodString;
export declare const GroupIdSchema: z.ZodString;
export declare const UserContextSchema: z.ZodObject<{
    id: z.ZodString;
    groupIds: z.ZodArray<z.ZodString, "many">;
    tenantId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    groupIds: string[];
}, {
    id: string;
    tenantId: string;
    groupIds: string[];
}>;
export declare const RetrievedDocumentSchema: z.ZodObject<{
    document: z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        metadata: z.ZodObject<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodUnknown, z.objectOutputType<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, z.ZodUnknown, "strip">, z.objectInputType<{
            tenantId: z.ZodString;
            docId: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            filepath: z.ZodOptional<z.ZodString>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            acl: z.ZodArray<z.ZodString, "many">;
        }, z.ZodUnknown, "strip">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }, {
        id: string;
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    }>;
    score: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    document: {
        id: string;
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    };
    score: number;
}, {
    document: {
        id: string;
        content: string;
        metadata: {
            tenantId: string;
            docId: string;
            acl: string[];
            version?: string | undefined;
            url?: string | undefined;
            filepath?: string | undefined;
            authors?: string[] | undefined;
            keywords?: string[] | undefined;
        } & {
            [k: string]: unknown;
        };
    };
    score: number;
}>;
export declare const AskRequestSchema: z.ZodObject<{
    query: z.ZodString;
    userContext: z.ZodObject<{
        id: z.ZodString;
        groupIds: z.ZodArray<z.ZodString, "many">;
        tenantId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        tenantId: string;
        groupIds: string[];
    }, {
        id: string;
        tenantId: string;
        groupIds: string[];
    }>;
    k: z.ZodOptional<z.ZodNumber>;
    filter: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    userContext: {
        id: string;
        tenantId: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
}, {
    query: string;
    userContext: {
        id: string;
        tenantId: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
}>;
export declare const GuardrailDecisionSchema: z.ZodObject<{
    isAnswerable: z.ZodBoolean;
    confidence: z.ZodNumber;
    reasonCode: z.ZodOptional<z.ZodString>;
    suggestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    isAnswerable: boolean;
    confidence: number;
    reasonCode?: string | undefined;
    suggestions?: string[] | undefined;
}, {
    isAnswerable: boolean;
    confidence: number;
    reasonCode?: string | undefined;
    suggestions?: string[] | undefined;
}>;
export declare const AskResponseSchema: z.ZodObject<{
    answer: z.ZodString;
    retrievedDocuments: z.ZodArray<z.ZodObject<{
        document: z.ZodObject<{
            id: z.ZodString;
            content: z.ZodString;
            metadata: z.ZodObject<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodUnknown, z.objectOutputType<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, z.ZodUnknown, "strip">, z.objectInputType<{
                tenantId: z.ZodString;
                docId: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                filepath: z.ZodOptional<z.ZodString>;
                authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                acl: z.ZodArray<z.ZodString, "many">;
            }, z.ZodUnknown, "strip">>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        }, {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        }>;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        document: {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        score: number;
    }, {
        document: {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        score: number;
    }>, "many">;
    queryId: z.ZodString;
    guardrailDecision: z.ZodOptional<z.ZodObject<{
        isAnswerable: z.ZodBoolean;
        confidence: z.ZodNumber;
        reasonCode: z.ZodOptional<z.ZodString>;
        suggestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
    }, {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    answer: string;
    retrievedDocuments: {
        document: {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        score: number;
    }[];
    queryId: string;
    guardrailDecision?: {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
    } | undefined;
}, {
    answer: string;
    retrievedDocuments: {
        document: {
            id: string;
            content: string;
            metadata: {
                tenantId: string;
                docId: string;
                acl: string[];
                version?: string | undefined;
                url?: string | undefined;
                filepath?: string | undefined;
                authors?: string[] | undefined;
                keywords?: string[] | undefined;
            } & {
                [k: string]: unknown;
            };
        };
        score: number;
    }[];
    queryId: string;
    guardrailDecision?: {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
    } | undefined;
}>;
/**
 * Schema for normalized document metadata.
 * Validates all required and optional fields for document metadata.
 */
export declare const NormalizedMetaSchema: z.ZodObject<{
    /** Tenant identifier for multi-tenancy support */
    tenant: z.ZodString;
    /** Unique document identifier within the tenant */
    docId: z.ZodString;
    /** Source system or origin of the document */
    source: z.ZodString;
    /** Optional path to the document in the source system */
    path: z.ZodOptional<z.ZodString>;
    /** Optional human-readable title of the document */
    title: z.ZodOptional<z.ZodString>;
    /** Optional language code (ISO 639-1 format) */
    lang: z.ZodOptional<z.ZodString>;
    /** Optional version identifier for document versioning */
    version: z.ZodOptional<z.ZodString>;
    /** SHA256 hash of the document content (64 hex characters) */
    sha256: z.ZodString;
    /** Access Control List - array of user/group identifiers */
    acl: z.ZodArray<z.ZodString, "many">;
    /** Optional array of document authors */
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Optional array of tags or keywords */
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** ISO 8601 timestamp when document was first ingested */
    timestamp: z.ZodString;
    /** Optional ISO 8601 timestamp of last modification */
    modifiedAt: z.ZodOptional<z.ZodString>;
    /** Optional soft delete flag */
    deleted: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    docId: string;
    acl: string[];
    tenant: string;
    source: string;
    sha256: string;
    timestamp: string;
    version?: string | undefined;
    path?: string | undefined;
    authors?: string[] | undefined;
    title?: string | undefined;
    lang?: string | undefined;
    tags?: string[] | undefined;
    modifiedAt?: string | undefined;
    deleted?: boolean | undefined;
}, {
    docId: string;
    acl: string[];
    tenant: string;
    source: string;
    sha256: string;
    timestamp: string;
    version?: string | undefined;
    path?: string | undefined;
    authors?: string[] | undefined;
    title?: string | undefined;
    lang?: string | undefined;
    tags?: string[] | undefined;
    modifiedAt?: string | undefined;
    deleted?: boolean | undefined;
}>;
/**
 * Schema for content blocks within a normalized document.
 * Validates block type and optional content fields.
 */
export declare const BlockSchema: z.ZodObject<{
    /** Type of content block */
    type: z.ZodEnum<["text", "table", "code", "image-ref"]>;
    /** Optional plain text content */
    text: z.ZodOptional<z.ZodString>;
    /** Optional HTML representation */
    html: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "code" | "text" | "table" | "image-ref";
    text?: string | undefined;
    html?: string | undefined;
}, {
    type: "code" | "text" | "table" | "image-ref";
    text?: string | undefined;
    html?: string | undefined;
}>;
/**
 * Schema for complete normalized document structure.
 * Contains validated metadata and array of content blocks.
 */
export declare const NormalizedDocSchema: z.ZodObject<{
    /** Document metadata */
    meta: z.ZodObject<{
        /** Tenant identifier for multi-tenancy support */
        tenant: z.ZodString;
        /** Unique document identifier within the tenant */
        docId: z.ZodString;
        /** Source system or origin of the document */
        source: z.ZodString;
        /** Optional path to the document in the source system */
        path: z.ZodOptional<z.ZodString>;
        /** Optional human-readable title of the document */
        title: z.ZodOptional<z.ZodString>;
        /** Optional language code (ISO 639-1 format) */
        lang: z.ZodOptional<z.ZodString>;
        /** Optional version identifier for document versioning */
        version: z.ZodOptional<z.ZodString>;
        /** SHA256 hash of the document content (64 hex characters) */
        sha256: z.ZodString;
        /** Access Control List - array of user/group identifiers */
        acl: z.ZodArray<z.ZodString, "many">;
        /** Optional array of document authors */
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Optional array of tags or keywords */
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** ISO 8601 timestamp when document was first ingested */
        timestamp: z.ZodString;
        /** Optional ISO 8601 timestamp of last modification */
        modifiedAt: z.ZodOptional<z.ZodString>;
        /** Optional soft delete flag */
        deleted: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        docId: string;
        acl: string[];
        tenant: string;
        source: string;
        sha256: string;
        timestamp: string;
        version?: string | undefined;
        path?: string | undefined;
        authors?: string[] | undefined;
        title?: string | undefined;
        lang?: string | undefined;
        tags?: string[] | undefined;
        modifiedAt?: string | undefined;
        deleted?: boolean | undefined;
    }, {
        docId: string;
        acl: string[];
        tenant: string;
        source: string;
        sha256: string;
        timestamp: string;
        version?: string | undefined;
        path?: string | undefined;
        authors?: string[] | undefined;
        title?: string | undefined;
        lang?: string | undefined;
        tags?: string[] | undefined;
        modifiedAt?: string | undefined;
        deleted?: boolean | undefined;
    }>;
    /** Array of content blocks */
    blocks: z.ZodArray<z.ZodObject<{
        /** Type of content block */
        type: z.ZodEnum<["text", "table", "code", "image-ref"]>;
        /** Optional plain text content */
        text: z.ZodOptional<z.ZodString>;
        /** Optional HTML representation */
        html: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "code" | "text" | "table" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }, {
        type: "code" | "text" | "table" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    meta: {
        docId: string;
        acl: string[];
        tenant: string;
        source: string;
        sha256: string;
        timestamp: string;
        version?: string | undefined;
        path?: string | undefined;
        authors?: string[] | undefined;
        title?: string | undefined;
        lang?: string | undefined;
        tags?: string[] | undefined;
        modifiedAt?: string | undefined;
        deleted?: boolean | undefined;
    };
    blocks: {
        type: "code" | "text" | "table" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }[];
}, {
    meta: {
        docId: string;
        acl: string[];
        tenant: string;
        source: string;
        sha256: string;
        timestamp: string;
        version?: string | undefined;
        path?: string | undefined;
        authors?: string[] | undefined;
        title?: string | undefined;
        lang?: string | undefined;
        tags?: string[] | undefined;
        modifiedAt?: string | undefined;
        deleted?: boolean | undefined;
    };
    blocks: {
        type: "code" | "text" | "table" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }[];
}>;
