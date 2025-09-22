import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * Email detector using comprehensive regex patterns
 */
export declare class EmailDetector implements PIIDetector {
    readonly type: "email";
    /**
     * Comprehensive email regex that covers most valid email formats
     * Based on RFC 5322 specification with practical limitations
     */
    private readonly emailRegex;
    /**
     * Detect email addresses in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for email addresses
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate email format and return confidence score
     */
    private validateEmail;
}
/**
 * Factory function to create email detector
 */
export declare function createEmailDetector(): EmailDetector;
