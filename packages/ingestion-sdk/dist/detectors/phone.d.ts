import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * Phone number detector supporting various international formats
 */
export declare class PhoneDetector implements PIIDetector {
    readonly type: "phone";
    /**
     * Comprehensive phone number regex patterns
     * Supports various international formats including:
     * - +1-555-123-4567, +1 (555) 123-4567
     * - 555-123-4567, (555) 123-4567
     * - +44 20 7946 0958, +33 1 42 68 53 00
     * - International formats with country codes
     */
    private readonly phonePatterns;
    /**
     * Detect phone numbers in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for phone numbers
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate phone number format and return confidence score
     */
    private validatePhone;
    /**
     * Check if area code is valid (simplified validation for US/Canada)
     */
    private isValidAreaCode;
}
/**
 * Factory function to create phone detector
 */
export declare function createPhoneDetector(): PhoneDetector;
