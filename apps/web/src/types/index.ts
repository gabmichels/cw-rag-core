// File upload types
export interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
}

// Preview response types
export interface PIIFinding {
  type: string;
  count: number;
}

export interface PreviewResponse {
  wouldPublish: boolean;
  findings: PIIFinding[];
  bytes: number;
  blocksCount: number;
  processedDocs: number;
  errors?: string[];
}

// Publish response types
export interface PublishResult {
  docId: string;
  status: 'published' | 'updated' | 'blocked' | 'deleted' | 'error';
  pointsUpserted?: number;
  message?: string;
  findings?: PIIFinding[];
}

export interface PublishResponse {
  results: PublishResult[];
  summary: {
    total: number;
    published: number;
    updated: number;
    blocked: number;
    deleted: number;
    errors: number;
  };
}

// Upload response types
export interface UploadProcessedFile {
  filename?: string;
  url?: string;
  docId: string;
  status: 'converted' | 'previewed' | 'published' | 'error';
  message?: string;
  preview?: {
    wouldPublish: boolean;
    findings: PIIFinding[];
    bytes: number;
    blocksCount: number;
  };
}

export interface UploadResponse {
  processed: UploadProcessedFile[];
  summary: {
    total: number;
    converted: number;
    published: number;
    errors: number;
  };
}

// Ingest history types
export interface IngestRecord {
  id: string;
  time: string;
  docId: string;
  source: string;
  action: 'publish' | 'skip' | 'tombstone' | 'block';
  version: string;
  redactionSummary: PIIFinding[];
  status: 'success' | 'error' | 'blocked';
  tenant: string;
  filename?: string;
  error?: string;
}

// Policy types
export interface PIIPolicy {
  mode: 'off' | 'mask' | 'block' | 'allowlist';
  allowedTypes?: string[];
  tenantId?: string;
  sourceOverrides?: Record<string, Partial<PIIPolicy>>;
}

// Form data types
export interface UploadFormData {
  tenant: string;
  source: string;
  acl: string[];
  title?: string;
  tags?: string[];
  authors?: string[];
  urls?: string[];
}

// API error response
export interface ApiError {
  error: string;
  message: string;
}