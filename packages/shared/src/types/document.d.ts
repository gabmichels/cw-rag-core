export type TenantId = string;
export interface DocumentMetadata {
    tenantId: TenantId;
    docId: string;
    version?: string;
    url?: string;
    filepath?: string;
    authors?: string[];
    keywords?: string[];
    acl: string[];
    [key: string]: unknown;
}
export interface Document {
    id: string;
    content: string;
    metadata: DocumentMetadata;
}
//# sourceMappingURL=document.d.ts.map