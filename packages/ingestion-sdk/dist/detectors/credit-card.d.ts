import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';
/**
 * Credit card detector supporting major card types
 */
export declare class CreditCardDetector implements PIIDetector {
    readonly type: "credit_card";
    /**
     * Credit card regex patterns for different card types
     */
    private readonly cardPatterns;
    /**
     * Card type patterns for validation
     */
    private readonly cardTypes;
    /**
     * Detect credit card numbers in the given text
     */
    detect(text: string, options?: DetectorOptions): PIIDetection[];
    /**
     * Generate appropriate mask for credit card numbers
     */
    getMask(detection: PIIDetection): string;
    /**
     * Validate credit card number and return confidence score
     */
    private validateCreditCard;
    /**
     * Validate credit card number using Luhn algorithm
     */
    private validateLuhn;
}
/**
 * Factory function to create credit card detector
 */
export declare function createCreditCardDetector(): CreditCardDetector;
