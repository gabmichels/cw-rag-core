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
}, "strip", z.ZodTypeAny, {
    query: string;
    userContext: {
        tenantId: string;
        id: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
}, {
    query: string;
    userContext: {
        tenantId: string;
        id: string;
        groupIds: string[];
    };
    filter?: Record<string, any> | undefined;
    k?: number | undefined;
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
}>;
//# sourceMappingURL=index.d.ts.map