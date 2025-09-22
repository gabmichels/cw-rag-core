import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * National ID detector for various countries
 * This is a generic implementation that can be extended for specific countries
 */
export declare class NationalIdDetector implements PIIDetector {
    readonly type: "national_id";
    /**
     * Generic patterns for national IDs from various countries
     */
    private readonly nationalIdPatterns;
    /**
     * Detect national ID numbers in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for national ID numbers
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate national ID format and return confidence score
     */
    private validateNationalId;
    /**
     * Validate US Social Security Number format
     */
    private validateSSN;
    /**
     * Validate UK National Insurance number format
     */
    private validateUKNI;
    /**
     * Validate Canadian Social Insurance Number format
     */
    private validateCanadianSIN;
}
/**
 * Factory function to create national ID detector
 */
export declare function createNationalIdDetector(): NationalIdDetector;
