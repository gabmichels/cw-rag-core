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
    tenantId: string;
    id: string;
    groupIds: string[];
}, {
    tenantId: string;
    id: string;
    groupIds: string[];
}>;
export declare const AskRequestSchema: z.ZodObject<{
    query: z.ZodString;
    userContext: z.ZodObject<{
        id: z.ZodString;
        groupIds: z.ZodArray<z.ZodString, "many">;
        tenantId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        tenantId: string;
        id: string;
        groupIds: string[];
    }, {
        tenantId: string;
        id: string;
        groupIds: string[];
    }>;
    k: z.ZodOptional<z.ZodNumber>;
    filter: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    hybridSearch: z.ZodOptional<z.ZodObject<{
        vectorWeight: z.ZodOptional<z.ZodNumber>;
        keywordWeight: z.ZodOptional<z.ZodNumber>;
        rrfK: z.ZodOptional<z.ZodNumber>;
        enableKeywordSearch: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        vectorWeight?: number | undefined;
        keywordWeight?: number | undefined;
        rrfK?: number | undefined;
        enableKeywordSearch?: boolean | undefined;
    }, {
        vectorWeight?: number | undefined;
        keywordWeight?: number | undefined;
        rrfK?: number | undefined;
        enableKeywordSearch?: boolean | undefined;
    }>>;
    reranker: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        model: z.ZodOptional<z.ZodString>;
        topK: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        model?: string | undefined;
        topK?: number | undefined;
    }, {
        enabled?: boolean | undefined;
        model?: string | undefined;
        topK?: number | undefined;
    }>>;
    synthesis: z.ZodOptional<z.ZodObject<{
        maxContextLength: z.ZodOptional<z.ZodNumber>;
        includeCitations: z.ZodOptional<z.ZodBoolean>;
        answerFormat: z.ZodOptional<z.ZodEnum<["markdown", "plain"]>>;
    }, "strip", z.ZodTypeAny, {
        maxContextLength?: number | undefined;
        includeCitations?: boolean | undefined;
        answerFormat?: "markdown" | "plain" | undefined;
    }, {
        maxContextLength?: number | undefined;
        includeCitations?: boolean | undefined;
        answerFormat?: "markdown" | "plain" | undefined;
    }>>;
    includeMetrics: z.ZodOptional<z.ZodBoolean>;
    includeDebugInfo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    query: string;
    userContext: {
        tenantId: string;
        id: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
    hybridSearch?: {
        vectorWeight?: number | undefined;
        keywordWeight?: number | undefined;
        rrfK?: number | undefined;
        enableKeywordSearch?: boolean | undefined;
    } | undefined;
    reranker?: {
        enabled?: boolean | undefined;
        model?: string | undefined;
        topK?: number | undefined;
    } | undefined;
    synthesis?: {
        maxContextLength?: number | undefined;
        includeCitations?: boolean | undefined;
        answerFormat?: "markdown" | "plain" | undefined;
    } | undefined;
    includeMetrics?: boolean | undefined;
    includeDebugInfo?: boolean | undefined;
}, {
    query: string;
    userContext: {
        tenantId: string;
        id: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
    hybridSearch?: {
        vectorWeight?: number | undefined;
        keywordWeight?: number | undefined;
        rrfK?: number | undefined;
        enableKeywordSearch?: boolean | undefined;
    } | undefined;
    reranker?: {
        enabled?: boolean | undefined;
        model?: string | undefined;
        topK?: number | undefined;
    } | undefined;
    synthesis?: {
        maxContextLength?: number | undefined;
        includeCitations?: boolean | undefined;
        answerFormat?: "markdown" | "plain" | undefined;
    } | undefined;
    includeMetrics?: boolean | undefined;
    includeDebugInfo?: boolean | undefined;
}>;
export declare const EnhancedRetrievedDocumentSchema: z.ZodObject<{
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
    freshness: z.ZodOptional<z.ZodObject<{
        category: z.ZodEnum<["Fresh", "Recent", "Stale"]>;
        badge: z.ZodString;
        humanReadable: z.ZodString;
        ageInDays: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        category: "Fresh" | "Recent" | "Stale";
        badge: string;
        humanReadable: string;
        ageInDays: number;
    }, {
        category: "Fresh" | "Recent" | "Stale";
        badge: string;
        humanReadable: string;
        ageInDays: number;
    }>>;
    searchType: z.ZodOptional<z.ZodEnum<["hybrid", "vector_only", "keyword_only"]>>;
    vectorScore: z.ZodOptional<z.ZodNumber>;
    keywordScore: z.ZodOptional<z.ZodNumber>;
    fusionScore: z.ZodOptional<z.ZodNumber>;
    rerankerScore: z.ZodOptional<z.ZodNumber>;
    rank: z.ZodOptional<z.ZodNumber>;
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
    freshness?: {
        category: "Fresh" | "Recent" | "Stale";
        badge: string;
        humanReadable: string;
        ageInDays: number;
    } | undefined;
    searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
    vectorScore?: number | undefined;
    keywordScore?: number | undefined;
    fusionScore?: number | undefined;
    rerankerScore?: number | undefined;
    rank?: number | undefined;
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
    freshness?: {
        category: "Fresh" | "Recent" | "Stale";
        badge: string;
        humanReadable: string;
        ageInDays: number;
    } | undefined;
    searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
    vectorScore?: number | undefined;
    keywordScore?: number | undefined;
    fusionScore?: number | undefined;
    rerankerScore?: number | undefined;
    rank?: number | undefined;
}>;
export declare const GuardrailDecisionSchema: z.ZodObject<{
    isAnswerable: z.ZodBoolean;
    confidence: z.ZodNumber;
    reasonCode: z.ZodOptional<z.ZodString>;
    suggestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scoreStats: z.ZodOptional<z.ZodObject<{
        mean: z.ZodNumber;
        max: z.ZodNumber;
        min: z.ZodNumber;
        stdDev: z.ZodNumber;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        mean: number;
        max: number;
        min: number;
        stdDev: number;
        count: number;
    }, {
        mean: number;
        max: number;
        min: number;
        stdDev: number;
        count: number;
    }>>;
    algorithmScores: z.ZodOptional<z.ZodObject<{
        statistical: z.ZodNumber;
        threshold: z.ZodNumber;
        mlFeatures: z.ZodNumber;
        rerankerConfidence: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        statistical: number;
        threshold: number;
        mlFeatures: number;
        rerankerConfidence?: number | undefined;
    }, {
        statistical: number;
        threshold: number;
        mlFeatures: number;
        rerankerConfidence?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    isAnswerable: boolean;
    confidence: number;
    reasonCode?: string | undefined;
    suggestions?: string[] | undefined;
    scoreStats?: {
        mean: number;
        max: number;
        min: number;
        stdDev: number;
        count: number;
    } | undefined;
    algorithmScores?: {
        statistical: number;
        threshold: number;
        mlFeatures: number;
        rerankerConfidence?: number | undefined;
    } | undefined;
}, {
    isAnswerable: boolean;
    confidence: number;
    reasonCode?: string | undefined;
    suggestions?: string[] | undefined;
    scoreStats?: {
        mean: number;
        max: number;
        min: number;
        stdDev: number;
        count: number;
    } | undefined;
    algorithmScores?: {
        statistical: number;
        threshold: number;
        mlFeatures: number;
        rerankerConfidence?: number | undefined;
    } | undefined;
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
        freshness: z.ZodOptional<z.ZodObject<{
            category: z.ZodEnum<["Fresh", "Recent", "Stale"]>;
            badge: z.ZodString;
            humanReadable: z.ZodString;
            ageInDays: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        }, {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        }>>;
        searchType: z.ZodOptional<z.ZodEnum<["hybrid", "vector_only", "keyword_only"]>>;
        vectorScore: z.ZodOptional<z.ZodNumber>;
        keywordScore: z.ZodOptional<z.ZodNumber>;
        fusionScore: z.ZodOptional<z.ZodNumber>;
        rerankerScore: z.ZodOptional<z.ZodNumber>;
        rank: z.ZodOptional<z.ZodNumber>;
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
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
        searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
        vectorScore?: number | undefined;
        keywordScore?: number | undefined;
        fusionScore?: number | undefined;
        rerankerScore?: number | undefined;
        rank?: number | undefined;
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
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
        searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
        vectorScore?: number | undefined;
        keywordScore?: number | undefined;
        fusionScore?: number | undefined;
        rerankerScore?: number | undefined;
        rank?: number | undefined;
    }>, "many">;
    queryId: z.ZodString;
    guardrailDecision: z.ZodOptional<z.ZodObject<{
        isAnswerable: z.ZodBoolean;
        confidence: z.ZodNumber;
        reasonCode: z.ZodOptional<z.ZodString>;
        suggestions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        scoreStats: z.ZodOptional<z.ZodObject<{
            mean: z.ZodNumber;
            max: z.ZodNumber;
            min: z.ZodNumber;
            stdDev: z.ZodNumber;
            count: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        }, {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        }>>;
        algorithmScores: z.ZodOptional<z.ZodObject<{
            statistical: z.ZodNumber;
            threshold: z.ZodNumber;
            mlFeatures: z.ZodNumber;
            rerankerConfidence: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        }, {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
        scoreStats?: {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        } | undefined;
        algorithmScores?: {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        } | undefined;
    }, {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
        scoreStats?: {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        } | undefined;
        algorithmScores?: {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        } | undefined;
    }>>;
    freshnessStats: z.ZodOptional<z.ZodObject<{
        totalDocuments: z.ZodNumber;
        freshPercentage: z.ZodNumber;
        recentPercentage: z.ZodNumber;
        stalePercentage: z.ZodNumber;
        avgAgeInDays: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        totalDocuments: number;
        freshPercentage: number;
        recentPercentage: number;
        stalePercentage: number;
        avgAgeInDays: number;
    }, {
        totalDocuments: number;
        freshPercentage: number;
        recentPercentage: number;
        stalePercentage: number;
        avgAgeInDays: number;
    }>>;
    citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        number: z.ZodNumber;
        source: z.ZodString;
        freshness: z.ZodOptional<z.ZodObject<{
            category: z.ZodEnum<["Fresh", "Recent", "Stale"]>;
            badge: z.ZodString;
            humanReadable: z.ZodString;
            ageInDays: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        }, {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        }>>;
        docId: z.ZodOptional<z.ZodString>;
        version: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        filepath: z.ZodOptional<z.ZodString>;
        authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        number: number;
        id: string;
        source: string;
        docId?: string | undefined;
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
    }, {
        number: number;
        id: string;
        source: string;
        docId?: string | undefined;
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
    }>, "many">>;
    metrics: z.ZodOptional<z.ZodObject<{
        totalDuration: z.ZodNumber;
        vectorSearchDuration: z.ZodOptional<z.ZodNumber>;
        keywordSearchDuration: z.ZodOptional<z.ZodNumber>;
        fusionDuration: z.ZodOptional<z.ZodNumber>;
        rerankerDuration: z.ZodOptional<z.ZodNumber>;
        guardrailDuration: z.ZodOptional<z.ZodNumber>;
        synthesisTime: z.ZodOptional<z.ZodNumber>;
        vectorResultCount: z.ZodOptional<z.ZodNumber>;
        keywordResultCount: z.ZodOptional<z.ZodNumber>;
        finalResultCount: z.ZodOptional<z.ZodNumber>;
        documentsReranked: z.ZodOptional<z.ZodNumber>;
        rerankingEnabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        totalDuration: number;
        vectorSearchDuration?: number | undefined;
        keywordSearchDuration?: number | undefined;
        fusionDuration?: number | undefined;
        rerankerDuration?: number | undefined;
        guardrailDuration?: number | undefined;
        synthesisTime?: number | undefined;
        vectorResultCount?: number | undefined;
        keywordResultCount?: number | undefined;
        finalResultCount?: number | undefined;
        documentsReranked?: number | undefined;
        rerankingEnabled?: boolean | undefined;
    }, {
        totalDuration: number;
        vectorSearchDuration?: number | undefined;
        keywordSearchDuration?: number | undefined;
        fusionDuration?: number | undefined;
        rerankerDuration?: number | undefined;
        guardrailDuration?: number | undefined;
        synthesisTime?: number | undefined;
        vectorResultCount?: number | undefined;
        keywordResultCount?: number | undefined;
        finalResultCount?: number | undefined;
        documentsReranked?: number | undefined;
        rerankingEnabled?: boolean | undefined;
    }>>;
    synthesisMetadata: z.ZodOptional<z.ZodObject<{
        tokensUsed: z.ZodNumber;
        modelUsed: z.ZodString;
        contextTruncated: z.ZodBoolean;
        confidence: z.ZodNumber;
        llmProvider: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        tokensUsed: number;
        modelUsed: string;
        contextTruncated: boolean;
        llmProvider?: string | undefined;
    }, {
        confidence: number;
        tokensUsed: number;
        modelUsed: string;
        contextTruncated: boolean;
        llmProvider?: string | undefined;
    }>>;
    debug: z.ZodOptional<z.ZodObject<{
        hybridSearchConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        rerankerConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        guardrailConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        retrievalSteps: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        hybridSearchConfig?: Record<string, any> | undefined;
        rerankerConfig?: Record<string, any> | undefined;
        guardrailConfig?: Record<string, any> | undefined;
        retrievalSteps?: string[] | undefined;
    }, {
        hybridSearchConfig?: Record<string, any> | undefined;
        rerankerConfig?: Record<string, any> | undefined;
        guardrailConfig?: Record<string, any> | undefined;
        retrievalSteps?: string[] | undefined;
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
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
        searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
        vectorScore?: number | undefined;
        keywordScore?: number | undefined;
        fusionScore?: number | undefined;
        rerankerScore?: number | undefined;
        rank?: number | undefined;
    }[];
    queryId: string;
    guardrailDecision?: {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
        scoreStats?: {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        } | undefined;
        algorithmScores?: {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        } | undefined;
    } | undefined;
    freshnessStats?: {
        totalDocuments: number;
        freshPercentage: number;
        recentPercentage: number;
        stalePercentage: number;
        avgAgeInDays: number;
    } | undefined;
    citations?: {
        number: number;
        id: string;
        source: string;
        docId?: string | undefined;
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
    }[] | undefined;
    metrics?: {
        totalDuration: number;
        vectorSearchDuration?: number | undefined;
        keywordSearchDuration?: number | undefined;
        fusionDuration?: number | undefined;
        rerankerDuration?: number | undefined;
        guardrailDuration?: number | undefined;
        synthesisTime?: number | undefined;
        vectorResultCount?: number | undefined;
        keywordResultCount?: number | undefined;
        finalResultCount?: number | undefined;
        documentsReranked?: number | undefined;
        rerankingEnabled?: boolean | undefined;
    } | undefined;
    synthesisMetadata?: {
        confidence: number;
        tokensUsed: number;
        modelUsed: string;
        contextTruncated: boolean;
        llmProvider?: string | undefined;
    } | undefined;
    debug?: {
        hybridSearchConfig?: Record<string, any> | undefined;
        rerankerConfig?: Record<string, any> | undefined;
        guardrailConfig?: Record<string, any> | undefined;
        retrievalSteps?: string[] | undefined;
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
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
        searchType?: "hybrid" | "vector_only" | "keyword_only" | undefined;
        vectorScore?: number | undefined;
        keywordScore?: number | undefined;
        fusionScore?: number | undefined;
        rerankerScore?: number | undefined;
        rank?: number | undefined;
    }[];
    queryId: string;
    guardrailDecision?: {
        isAnswerable: boolean;
        confidence: number;
        reasonCode?: string | undefined;
        suggestions?: string[] | undefined;
        scoreStats?: {
            mean: number;
            max: number;
            min: number;
            stdDev: number;
            count: number;
        } | undefined;
        algorithmScores?: {
            statistical: number;
            threshold: number;
            mlFeatures: number;
            rerankerConfidence?: number | undefined;
        } | undefined;
    } | undefined;
    freshnessStats?: {
        totalDocuments: number;
        freshPercentage: number;
        recentPercentage: number;
        stalePercentage: number;
        avgAgeInDays: number;
    } | undefined;
    citations?: {
        number: number;
        id: string;
        source: string;
        docId?: string | undefined;
        version?: string | undefined;
        url?: string | undefined;
        filepath?: string | undefined;
        authors?: string[] | undefined;
        freshness?: {
            category: "Fresh" | "Recent" | "Stale";
            badge: string;
            humanReadable: string;
            ageInDays: number;
        } | undefined;
    }[] | undefined;
    metrics?: {
        totalDuration: number;
        vectorSearchDuration?: number | undefined;
        keywordSearchDuration?: number | undefined;
        fusionDuration?: number | undefined;
        rerankerDuration?: number | undefined;
        guardrailDuration?: number | undefined;
        synthesisTime?: number | undefined;
        vectorResultCount?: number | undefined;
        keywordResultCount?: number | undefined;
        finalResultCount?: number | undefined;
        documentsReranked?: number | undefined;
        rerankingEnabled?: boolean | undefined;
    } | undefined;
    synthesisMetadata?: {
        confidence: number;
        tokensUsed: number;
        modelUsed: string;
        contextTruncated: boolean;
        llmProvider?: string | undefined;
    } | undefined;
    debug?: {
        hybridSearchConfig?: Record<string, any> | undefined;
        rerankerConfig?: Record<string, any> | undefined;
        guardrailConfig?: Record<string, any> | undefined;
        retrievalSteps?: string[] | undefined;
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
    sha256: string;
    source: string;
    timestamp: string;
    version?: string | undefined;
    authors?: string[] | undefined;
    lang?: string | undefined;
    modifiedAt?: string | undefined;
    path?: string | undefined;
    title?: string | undefined;
    tags?: string[] | undefined;
    deleted?: boolean | undefined;
}, {
    docId: string;
    acl: string[];
    tenant: string;
    sha256: string;
    source: string;
    timestamp: string;
    version?: string | undefined;
    authors?: string[] | undefined;
    lang?: string | undefined;
    modifiedAt?: string | undefined;
    path?: string | undefined;
    title?: string | undefined;
    tags?: string[] | undefined;
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
    type: "text" | "table" | "code" | "image-ref";
    text?: string | undefined;
    html?: string | undefined;
}, {
    type: "text" | "table" | "code" | "image-ref";
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
        sha256: string;
        source: string;
        timestamp: string;
        version?: string | undefined;
        authors?: string[] | undefined;
        lang?: string | undefined;
        modifiedAt?: string | undefined;
        path?: string | undefined;
        title?: string | undefined;
        tags?: string[] | undefined;
        deleted?: boolean | undefined;
    }, {
        docId: string;
        acl: string[];
        tenant: string;
        sha256: string;
        source: string;
        timestamp: string;
        version?: string | undefined;
        authors?: string[] | undefined;
        lang?: string | undefined;
        modifiedAt?: string | undefined;
        path?: string | undefined;
        title?: string | undefined;
        tags?: string[] | undefined;
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
        type: "text" | "table" | "code" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }, {
        type: "text" | "table" | "code" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    meta: {
        docId: string;
        acl: string[];
        tenant: string;
        sha256: string;
        source: string;
        timestamp: string;
        version?: string | undefined;
        authors?: string[] | undefined;
        lang?: string | undefined;
        modifiedAt?: string | undefined;
        path?: string | undefined;
        title?: string | undefined;
        tags?: string[] | undefined;
        deleted?: boolean | undefined;
    };
    blocks: {
        type: "text" | "table" | "code" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }[];
}, {
    meta: {
        docId: string;
        acl: string[];
        tenant: string;
        sha256: string;
        source: string;
        timestamp: string;
        version?: string | undefined;
        authors?: string[] | undefined;
        lang?: string | undefined;
        modifiedAt?: string | undefined;
        path?: string | undefined;
        title?: string | undefined;
        tags?: string[] | undefined;
        deleted?: boolean | undefined;
    };
    blocks: {
        type: "text" | "table" | "code" | "image-ref";
        text?: string | undefined;
        html?: string | undefined;
    }[];
}>;
