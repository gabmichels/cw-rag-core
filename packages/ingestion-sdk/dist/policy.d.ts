import { PIIPolicy, PIIType, PIIDetection, RedactionResult, RedactionSummary } from './types.js';
import { DetectorRegistry } from './detectors/index.js';
/**
 * Policy engine for PII detection and redaction
 */
export declare class PIIPolicyEngine {
    private detectorRegistry;
    constructor(detectorRegistry?: DetectorRegistry);
    /**
     * Apply redaction policy to text
     */
    applyRedaction(text: string, policy: PIIPolicy, sourcePath?: string): RedactionResult;
    /**
     * Get effective policy considering source overrides
     */
    private getEffectivePolicy;
    /**
     * Check if source path matches pattern (simple glob-like matching)
     */
    private matchesPath;
    /**
     * Detect all PII types in text
     */
    private detectAllPII;
    /**
     * Remove overlapping detections, keeping highest confidence
     */
    private deduplicateDetections;
    /**
     * Filter detections based on policy
     */
    private filterDetectionsByPolicy;
    /**
     * Apply masking to detected PII in text
     */
    private maskDetections;
    /**
     * Summarize detections for reporting (without exposing raw PII)
     */
    private summarizeDetections;
}
/**
 * Default policy engine instance
 */
export declare const defaultPolicyEngine: PIIPolicyEngine;
/**
 * Main function to apply redaction (convenience export)
 */
export declare function applyRedaction(text: string, policy: PIIPolicy, sourcePath?: string): RedactionResult;
/**
 * Summarize findings without exposing raw PII values
 */
export declare function summarizeFindings(detections: PIIDetection[]): RedactionSummary[];
/**
 * Create a default policy configuration
 */
export declare function createDefaultPolicy(tenantId?: string): PIIPolicy;
/**
 * Create an allowlist policy
 */
export declare function createAllowlistPolicy(allowedTypes: PIIType[], tenantId?: string): PIIPolicy;
/**
 * Create a block policy
 */
export declare function createBlockPolicy(tenantId?: string): PIIPolicy;
