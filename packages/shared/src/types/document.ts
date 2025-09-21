export type TenantId = string;

export interface DocumentMetadata {
  tenantId: TenantId;
  docId: string;
  version?: string;
  url?: string;
  filepath?: string;
  authors?: string[];
  keywords?: string[];
  acl: string[]; // Access Control List (e.g., user IDs, group IDs)
  [key: string]: unknown; // Allow arbitrary additional metadata fields
}

export interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}
