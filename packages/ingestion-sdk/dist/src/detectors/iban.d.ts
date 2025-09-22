import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * IBAN (International Bank Account Number) detector
 */
export declare class IBANDetector implements PIIDetector {
    readonly type: "iban";
    /**
     * IBAN regex pattern - matches IBAN format with optional spaces
     * IBAN format: 2 letter country code + 2 check digits + up to 30 alphanumeric characters
     */
    private readonly ibanRegex;
    /**
     * Country code to IBAN length mapping for validation
     */
    private readonly countryLengths;
    /**
     * Detect IBAN numbers in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for IBAN numbers
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate IBAN format and return confidence score
     */
    private validateIBAN;
    /**
     * Validate IBAN check digits using mod-97 algorithm
     */
    private validateCheckDigits;
    /**
     * Calculate mod 97 for large numbers (as strings)
     */
    private mod97;
}
/**
 * Factory function to create IBAN detector
 */
export declare function createIBANDetector(): IBANDetector;
