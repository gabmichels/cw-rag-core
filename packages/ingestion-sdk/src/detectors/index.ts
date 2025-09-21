/**
 * Detector exports and registry
 */
export { EmailDetector, createEmailDetector } from './email.js';
export { PhoneDetector, createPhoneDetector } from './phone.js';
export { IBANDetector, createIBANDetector } from './iban.js';
export { CreditCardDetector, createCreditCardDetector } from './credit-card.js';
export { NationalIdDetector, createNationalIdDetector } from './national-id.js';
export {
  APIKeyDetector,
  AWSKeyDetector,
  JWTDetector,
  createAPIKeyDetector,
  createAWSKeyDetector,
  createJWTDetector
} from './api-keys.js';

import { PIIDetector, PIIType } from '../types.js';
import { createEmailDetector } from './email.js';
import { createPhoneDetector } from './phone.js';
import { createIBANDetector } from './iban.js';
import { createCreditCardDetector } from './credit-card.js';
import { createNationalIdDetector } from './national-id.js';
import { createAPIKeyDetector, createAWSKeyDetector, createJWTDetector } from './api-keys.js';

/**
 * Registry of all available detectors
 */
export class DetectorRegistry {
  private detectors: Map<PIIType, PIIDetector>;

  constructor() {
    this.detectors = new Map();
    this.registerDefaultDetectors();
  }

  /**
   * Register default detectors
   */
  private registerDefaultDetectors(): void {
    this.register(createEmailDetector());
    this.register(createPhoneDetector());
    this.register(createIBANDetector());
    this.register(createCreditCardDetector());
    this.register(createNationalIdDetector());
    this.register(createAPIKeyDetector());
    this.register(createAWSKeyDetector());
    this.register(createJWTDetector());
  }

  /**
   * Register a detector
   */
  register(detector: PIIDetector): void {
    this.detectors.set(detector.type, detector);
  }

  /**
   * Get a detector by type
   */
  getDetector(type: PIIType): PIIDetector | undefined {
    return this.detectors.get(type);
  }

  /**
   * Get all registered detectors
   */
  getAllDetectors(): PIIDetector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * Get detectors for specific types
   */
  getDetectors(types: PIIType[]): PIIDetector[] {
    return types
      .map(type => this.detectors.get(type))
      .filter((detector): detector is PIIDetector => detector !== undefined);
  }
}

/**
 * Default detector registry instance
 */
export const defaultDetectorRegistry = new DetectorRegistry();