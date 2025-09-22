import { LanguageCode } from './user.js';

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
  lang?: LanguageCode; // Document language for language-based relevance scoring
  createdAt?: string; // ISO 8601 timestamp when document was first created
  modifiedAt?: string; // ISO 8601 timestamp when document was last modified
  [key: string]: unknown; // Allow arbitrary additional metadata fields
}

export interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}
