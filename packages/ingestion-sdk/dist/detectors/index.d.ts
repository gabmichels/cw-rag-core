/**
 * Detector exports and registry
 */
export { EmailDetector, createEmailDetector } from './email.js';
export { PhoneDetector, createPhoneDetector } from './phone.js';
export { IBANDetector, createIBANDetector } from './iban.js';
export { CreditCardDetector, createCreditCardDetector } from './credit-card.js';
export { NationalIdDetector, createNationalIdDetector } from './national-id.js';
export { APIKeyDetector, AWSKeyDetector, JWTDetector, createAPIKeyDetector, createAWSKeyDetector, createJWTDetector } from './api-keys.js';
import { PIIDetector, PIIType } from '../types.js';
/**
 * Registry of all available detectors
 */
export declare class DetectorRegistry {
    private detectors;
    constructor();
    /**
     * Register default detectors
     */
    private registerDefaultDetectors;
    /**
     * Register a detector
     */
    register(detector: PIIDetector): void;
    /**
     * Get a detector by type
     */
    getDetector(type: PIIType): PIIDetector | undefined;
    /**
     * Get all registered detectors
     */
    getAllDetectors(): PIIDetector[];
    /**
     * Get detectors for specific types
     */
    getDetectors(types: PIIType[]): PIIDetector[];
}
/**
 * Default detector registry instance
 */
export declare const defaultDetectorRegistry: DetectorRegistry;
