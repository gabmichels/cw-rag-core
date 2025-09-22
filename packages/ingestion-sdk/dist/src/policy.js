import { defaultDetectorRegistry } from './detectors/index.js';
/**
 * Policy engine for PII detection and redaction
 */
export class PIIPolicyEngine {
    detectorRegistry;
    constructor(detectorRegistry) {
        this.detectorRegistry = detectorRegistry || defaultDetectorRegistry;
    }
    /**
     * Apply redaction policy to text
     */
    applyRedaction(text, policy, sourcePath) {
        // Get effective policy (with source overrides if applicable)
        const effectivePolicy = this.getEffectivePolicy(policy, sourcePath);
        // If policy is 'off', return original text unchanged
        if (effectivePolicy.mode === 'off') {
            return {
                maskedText: text,
                redactions: [],
                blocked: false,
                originalLength: text.length
            };
        }
        // Detect all PII in the text
        const allDetections = this.detectAllPII(text);
        // Filter detections based on policy
        const filteredDetections = this.filterDetectionsByPolicy(allDetections, effectivePolicy);
        // Check if content should be blocked
        if (effectivePolicy.mode === 'block' && filteredDetections.length > 0) {
            return {
                maskedText: '[CONTENT_BLOCKED_DUE_TO_PII]',
                redactions: this.summarizeDetections(filteredDetections),
                blocked: true,
                originalLength: text.length
            };
        }
        // Apply masking if needed
        const maskedText = this.maskDetections(text, filteredDetections);
        return {
            maskedText,
            redactions: this.summarizeDetections(filteredDetections),
            blocked: false,
            originalLength: text.length
        };
    }
    /**
     * Get effective policy considering source overrides
     */
    getEffectivePolicy(basePolicy, sourcePath) {
        if (!sourcePath || !basePolicy.sourceOverrides) {
            return basePolicy;
        }
        // Find matching source override
        for (const [pathPattern, override] of Object.entries(basePolicy.sourceOverrides)) {
            if (this.matchesPath(sourcePath, pathPattern)) {
                return {
                    ...basePolicy,
                    ...override
                };
            }
        }
        return basePolicy;
    }
    /**
     * Check if source path matches pattern (simple glob-like matching)
     */
    matchesPath(sourcePath, pattern) {
        // Convert glob pattern to regex
        // First escape literal dots, then convert glob patterns
        const regexPattern = pattern
            .replace(/\./g, '\\.') // Escape literal dots first
            .replace(/\*/g, '.*') // Convert * to .*
            .replace(/\?/g, '.'); // Convert ? to .
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(sourcePath);
    }
    /**
     * Detect all PII types in text
     */
    detectAllPII(text) {
        const allDetections = [];
        const detectors = this.detectorRegistry.getAllDetectors();
        for (const detector of detectors) {
            try {
                const detections = detector.detect(text);
                allDetections.push(...detections);
            }
            catch (error) {
                // Log error but continue with other detectors
                console.warn(`Error in detector ${detector.type}:`, error);
            }
        }
        // Sort detections by position and remove overlaps
        return this.deduplicateDetections(allDetections);
    }
    /**
     * Remove overlapping detections, keeping highest confidence
     */
    deduplicateDetections(detections) {
        if (detections.length === 0)
            return detections;
        // Sort by start position, then by confidence (descending)
        const sorted = detections.sort((a, b) => {
            if (a.start !== b.start)
                return a.start - b.start;
            return b.confidence - a.confidence;
        });
        const deduplicated = [];
        let lastEnd = -1;
        for (const detection of sorted) {
            // If this detection doesn't overlap with the last one, include it
            if (detection.start >= lastEnd) {
                deduplicated.push(detection);
                lastEnd = detection.end;
            }
            // If it overlaps but has higher confidence, replace the last one
            else if (deduplicated.length > 0 && detection.confidence > deduplicated[deduplicated.length - 1].confidence) {
                deduplicated[deduplicated.length - 1] = detection;
                lastEnd = detection.end;
            }
        }
        return deduplicated;
    }
    /**
     * Filter detections based on policy
     */
    filterDetectionsByPolicy(detections, policy) {
        if (policy.mode === 'allowlist' && policy.allowedTypes) {
            // In allowlist mode, only flag PII types that are NOT in the allowed list
            return detections.filter(detection => !policy.allowedTypes.includes(detection.type));
        }
        // For mask and block modes, flag all detected PII
        return detections;
    }
    /**
     * Apply masking to detected PII in text
     */
    maskDetections(text, detections) {
        if (detections.length === 0)
            return text;
        // Sort detections by start position (descending) to replace from end to start
        const sortedDetections = [...detections].sort((a, b) => b.start - a.start);
        let maskedText = text;
        for (const detection of sortedDetections) {
            const detector = this.detectorRegistry.getDetector(detection.type);
            if (detector) {
                const mask = detector.getMask(detection);
                maskedText = maskedText.slice(0, detection.start) + mask + maskedText.slice(detection.end);
            }
        }
        return maskedText;
    }
    /**
     * Summarize detections for reporting (without exposing raw PII)
     */
    summarizeDetections(detections) {
        const summary = new Map();
        for (const detection of detections) {
            const count = summary.get(detection.type) || 0;
            summary.set(detection.type, count + 1);
        }
        return Array.from(summary.entries()).map(([type, count]) => ({
            type,
            count
        }));
    }
}
/**
 * Default policy engine instance
 */
export const defaultPolicyEngine = new PIIPolicyEngine();
/**
 * Main function to apply redaction (convenience export)
 */
export function applyRedaction(text, policy, sourcePath) {
    return defaultPolicyEngine.applyRedaction(text, policy, sourcePath);
}
/**
 * Summarize findings without exposing raw PII values
 */
export function summarizeFindings(detections) {
    const summary = new Map();
    for (const detection of detections) {
        const count = summary.get(detection.type) || 0;
        summary.set(detection.type, count + 1);
    }
    return Array.from(summary.entries()).map(([type, count]) => ({
        type,
        count
    }));
}
/**
 * Create a default policy configuration
 */
export function createDefaultPolicy(tenantId) {
    return {
        mode: 'mask',
        tenantId,
        allowedTypes: undefined,
        sourceOverrides: undefined
    };
}
/**
 * Create an allowlist policy
 */
export function createAllowlistPolicy(allowedTypes, tenantId) {
    return {
        mode: 'allowlist',
        allowedTypes,
        tenantId,
        sourceOverrides: undefined
    };
}
/**
 * Create a block policy
 */
export function createBlockPolicy(tenantId) {
    return {
        mode: 'block',
        tenantId,
        allowedTypes: undefined,
        sourceOverrides: undefined
    };
}
