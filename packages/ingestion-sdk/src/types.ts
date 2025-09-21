/**
 * Supported PII types for detection and redaction
 */
export type PIIType =
  | 'email'
  | 'phone'
  | 'iban'
  | 'credit_card'
  | 'national_id'
  | 'api_key'
  | 'aws_key'
  | 'jwt_token'
  | 'generic_token';

/**
 * Policy modes for handling detected PII
 */
export type PolicyMode = 'off' | 'mask' | 'block' | 'allowlist';

/**
 * Configuration for PII detection and redaction policy
 */
export interface PIIPolicy {
  /** Policy mode - determines how PII is handled */
  mode: PolicyMode;

  /** When mode is 'allowlist', specifies which PII types are allowed */
  allowedTypes?: PIIType[];

  /** Optional tenant-specific configuration */
  tenantId?: string;

  /** Optional source/path-specific overrides */
  sourceOverrides?: Record<string, Partial<PIIPolicy>>;
}

/**
 * Result of PII detection for a single occurrence
 */
export interface PIIDetection {
  /** Type of PII detected */
  type: PIIType;

  /** Start position in the text */
  start: number;

  /** End position in the text */
  end: number;

  /** Confidence score (0-1) - for future enhancement */
  confidence: number;
}

/**
 * Summary of redactions performed (never includes raw PII values)
 */
export interface RedactionSummary {
  /** Type of PII and count of redactions */
  type: PIIType;

  /** Number of instances redacted */
  count: number;
}

/**
 * Result of applying redaction policy to text
 */
export interface RedactionResult {
  /** Redacted/masked text (safe to log/store) */
  maskedText: string;

  /** Summary of redactions performed */
  redactions: RedactionSummary[];

  /** Whether the text was blocked due to policy */
  blocked: boolean;

  /** Original text length (for audit purposes) */
  originalLength: number;
}

/**
 * Configuration options for individual detectors
 */
export interface DetectorOptions {
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;

  /** Whether to enable strict validation */
  strictValidation?: boolean;
}

/**
 * Interface for PII detectors
 */
export interface PIIDetector {
  /** The type of PII this detector identifies */
  type: PIIType;

  /** Detect PII in the given text */
  detect(text: string, options?: DetectorOptions): PIIDetection[];

  /** Generate appropriate mask for this PII type */
  getMask(detection: PIIDetection): string;
}