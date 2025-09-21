import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';

/**
 * IBAN (International Bank Account Number) detector
 */
export class IBANDetector implements PIIDetector {
  public readonly type = 'iban' as const;

  /**
   * IBAN regex pattern - matches IBAN format with optional spaces
   * IBAN format: 2 letter country code + 2 check digits + up to 30 alphanumeric characters
   */
  private readonly ibanRegex = /\b[A-Z]{2}\s?[0-9]{2}\s?[A-Z0-9]{4}(\s?[A-Z0-9]{4})*\s?[A-Z0-9]{0,4}\b/g;

  /**
   * Country code to IBAN length mapping for validation
   */
  private readonly countryLengths: Record<string, number> = {
    'AD': 24, 'AE': 23, 'AL': 28, 'AT': 20, 'AZ': 28, 'BA': 20, 'BE': 16,
    'BG': 22, 'BH': 22, 'BR': 29, 'BY': 28, 'CH': 21, 'CR': 22, 'CY': 28,
    'CZ': 24, 'DE': 22, 'DK': 18, 'DO': 28, 'EE': 20, 'EG': 29, 'ES': 24,
    'FI': 18, 'FO': 18, 'FR': 27, 'GB': 22, 'GE': 22, 'GI': 23, 'GL': 18,
    'GR': 27, 'GT': 28, 'HR': 21, 'HU': 28, 'IE': 22, 'IL': 23, 'IS': 26,
    'IT': 27, 'JO': 30, 'KW': 30, 'KZ': 20, 'LB': 28, 'LC': 32, 'LI': 21,
    'LT': 20, 'LU': 20, 'LV': 21, 'MC': 27, 'MD': 24, 'ME': 22, 'MK': 19,
    'MR': 27, 'MT': 31, 'MU': 30, 'NL': 18, 'NO': 15, 'PK': 24, 'PL': 28,
    'PS': 29, 'PT': 25, 'QA': 29, 'RO': 24, 'RS': 22, 'SA': 24, 'SE': 24,
    'SI': 19, 'SK': 24, 'SM': 27, 'TN': 24, 'TR': 26, 'UA': 29, 'VG': 24,
    'XK': 20
  };

  /**
   * Detect IBAN numbers in the given text
   */
  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.9, strictValidation = true } = options;
    const detections: PIIDetection[] = [];

    let match;
    this.ibanRegex.lastIndex = 0; // Reset regex state

    while ((match = this.ibanRegex.exec(text)) !== null) {
      const ibanCandidate = match[0];
      let confidence = 0.8; // Base confidence for regex match

      if (strictValidation) {
        confidence = this.validateIBAN(ibanCandidate);
      }

      if (confidence >= minConfidence) {
        detections.push({
          type: this.type,
          start: match.index,
          end: match.index + ibanCandidate.length,
          confidence
        });
      }
    }

    return detections;
  }

  /**
   * Generate appropriate mask for IBAN numbers
   */
  getMask(detection: PIIDetection): string {
    return '[IBAN_REDACTED]';
  }

  /**
   * Validate IBAN format and return confidence score
   */
  private validateIBAN(iban: string): number {
    let confidence = 0.6; // Base confidence

    // Remove spaces and convert to uppercase
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();

    // Check minimum length
    if (cleanIban.length < 15 || cleanIban.length > 34) return 0;

    // Extract country code and check if it's valid
    const countryCode = cleanIban.slice(0, 2);
    if (!/^[A-Z]{2}$/.test(countryCode)) return 0;

    // Check if country code exists in our mapping
    if (this.countryLengths[countryCode]) {
      confidence += 0.2;

      // Check if length matches expected length for country
      if (cleanIban.length === this.countryLengths[countryCode]) {
        confidence += 0.2;
      } else {
        confidence -= 0.3; // Wrong length for known country
      }
    }

    // Check digits (positions 2-3)
    const checkDigits = cleanIban.slice(2, 4);
    if (!/^[0-9]{2}$/.test(checkDigits)) return 0;
    confidence += 0.1;

    // Validate check digits using mod-97 algorithm
    if (this.validateCheckDigits(cleanIban)) {
      confidence += 0.3;
    } else {
      confidence -= 0.4; // Invalid check digits
    }

    return Math.max(0, Math.min(confidence, 1.0));
  }

  /**
   * Validate IBAN check digits using mod-97 algorithm
   */
  private validateCheckDigits(iban: string): boolean {
    try {
      // Move first 4 characters to end
      const rearranged = iban.slice(4) + iban.slice(0, 4);

      // Replace letters with numbers (A=10, B=11, ..., Z=35)
      const numeric = rearranged.replace(/[A-Z]/g, (char) =>
        (char.charCodeAt(0) - 55).toString()
      );

      // Calculate mod 97
      return this.mod97(numeric) === 1;
    } catch {
      return false;
    }
  }

  /**
   * Calculate mod 97 for large numbers (as strings)
   */
  private mod97(numStr: string): number {
    let remainder = 0;
    for (let i = 0; i < numStr.length; i++) {
      remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97;
    }
    return remainder;
  }
}

/**
 * Factory function to create IBAN detector
 */
export function createIBANDetector(): IBANDetector {
  return new IBANDetector();
}