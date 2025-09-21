import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';

/**
 * Phone number detector supporting various international formats
 */
export class PhoneDetector implements PIIDetector {
  public readonly type = 'phone' as const;

  /**
   * Comprehensive phone number regex patterns
   * Supports various international formats including:
   * - +1-555-123-4567, +1 (555) 123-4567
   * - 555-123-4567, (555) 123-4567
   * - +44 20 7946 0958, +33 1 42 68 53 00
   * - International formats with country codes
   */
  private readonly phonePatterns = [
    // International format with country code
    /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{0,4}/g,
    // US/Canadian format
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    // Generic format with spaces or hyphens
    /\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/g
  ];

  /**
   * Detect phone numbers in the given text
   */
  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.8, strictValidation = true } = options;
    const detections: PIIDetection[] = [];
    const foundRanges = new Set<string>(); // Avoid duplicates

    for (const pattern of this.phonePatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(text)) !== null) {
        const phoneCandidate = match[0];
        const rangeKey = `${match.index}-${match.index + phoneCandidate.length}`;

        // Skip if we've already found this range
        if (foundRanges.has(rangeKey)) continue;

        let confidence = 0.8; // Base confidence for regex match

        if (strictValidation) {
          confidence = this.validatePhone(phoneCandidate);
        }

        if (confidence >= minConfidence) {
          detections.push({
            type: this.type,
            start: match.index,
            end: match.index + phoneCandidate.length,
            confidence
          });
          foundRanges.add(rangeKey);
        }
      }
    }

    return detections;
  }

  /**
   * Generate appropriate mask for phone numbers
   */
  getMask(detection: PIIDetection): string {
    return '[PHONE_REDACTED]';
  }

  /**
   * Validate phone number format and return confidence score
   */
  private validatePhone(phone: string): number {
    let confidence = 0.6; // Base confidence

    // Remove all non-digit characters for validation
    const digitsOnly = phone.replace(/\D/g, '');

    // Check digit count
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return 0;

    // Increase confidence based on patterns
    if (digitsOnly.length >= 10) confidence += 0.2;
    if (phone.includes('+')) confidence += 0.1; // International format
    if (/\(\d{3}\)/.test(phone)) confidence += 0.1; // US area code format
    if (/\d{3}-\d{3}-\d{4}/.test(phone)) confidence += 0.1; // US standard format

    // Decrease confidence for suspicious patterns
    if (/^(\d)\1+$/.test(digitsOnly)) confidence -= 0.3; // All same digits
    if (digitsOnly === '1234567890' || digitsOnly === '0123456789') confidence -= 0.4; // Sequential

    // Check for valid area codes (US/Canada)
    if (digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith('1'))) {
      const areaCode = digitsOnly.length === 11 ? digitsOnly.slice(1, 4) : digitsOnly.slice(0, 3);
      if (this.isValidAreaCode(areaCode)) {
        confidence += 0.1;
      } else {
        // For invalid area codes, reduce confidence but not drastically
        confidence -= 0.2;
      }
    }

    return Math.max(0, Math.min(confidence, 1.0));
  }

  /**
   * Check if area code is valid (simplified validation for US/Canada)
   */
  private isValidAreaCode(areaCode: string): boolean {
    const firstDigit = parseInt(areaCode[0]);
    const secondDigit = parseInt(areaCode[1]);

    // Area codes cannot start with 0 or 1
    if (firstDigit === 0 || firstDigit === 1) return false;

    // Second digit cannot be 9 in North American numbering plan
    if (secondDigit === 9) return false;

    return true;
  }
}

/**
 * Factory function to create phone detector
 */
export function createPhoneDetector(): PhoneDetector {
  return new PhoneDetector();
}