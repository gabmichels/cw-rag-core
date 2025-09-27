import { PIIDetector, PIIDetection, DetectorOptions } from '../types.js';

/**
 * Credit card detector supporting major card types
 */
export class CreditCardDetector implements PIIDetector {
  public readonly type = 'credit_card' as const;

  /**
   * Credit card regex patterns for different card types
   */
  private readonly cardPatterns = [
    // Visa: 4xxx-xxxx-xxxx-xxxx (13, 16, or 19 digits)
    /\b4\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // Visa: 16 digits without separators
    /\b4\d{15}\b/g,
    // MasterCard: 5xxx-xxxx-xxxx-xxxx or 2xxx-xxxx-xxxx-xxxx (16 digits)
    /\b[25]\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // MasterCard: 16 digits without separators
    /\b[25]\d{15}\b/g,
    // American Express: 3xxx-xxxxxx-xxxxx (15 digits)
    /\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g,
    // American Express: 15 digits without separators
    /\b3[47]\d{13}\b/g,
    // Discover: 6xxx-xxxx-xxxx-xxxx (16 digits)
    /\b6\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // Discover: 16 digits without separators
    /\b6\d{15}\b/g,
    // Generic pattern for other formats
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g
  ];

  /**
   * Card type patterns for validation
   */
  private readonly cardTypes = {
    visa: /^4\d{12}(?:\d{3}|\d{6})?$/,
    mastercard: /^5[1-5]\d{14}$|^2(?:2(?:2[1-9]|[3-9]\d)|[3-6]\d{2}|7(?:[01]\d|20))\d{12}$/,
    amex: /^3[47]\d{13}$/,
    discover: /^6(?:011|5\d{2})\d{12}$/,
    dinersclub: /^3[0689]\d{11}$/,
    jcb: /^(?:2131|1800|35\d{3})\d{11}$/
  };

  /**
   * Detect credit card numbers in the given text
   */
  detect(text: string, options: DetectorOptions = {}): PIIDetection[] {
    const { minConfidence = 0.9, strictValidation = true } = options;
    const detections: PIIDetection[] = [];
    const foundRanges = new Set<string>(); // Avoid duplicates

    for (const pattern of this.cardPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(text)) !== null) {
        const cardCandidate = match[0];
        const rangeKey = `${match.index}-${match.index + cardCandidate.length}`;

        // Skip if we've already found this range
        if (foundRanges.has(rangeKey)) continue;

        let confidence = 0.9; // Base confidence for regex match

        if (strictValidation) {
          confidence = this.validateCreditCard(cardCandidate);
        }

        if (confidence >= minConfidence) {
          detections.push({
            type: this.type,
            start: match.index,
            end: match.index + cardCandidate.length,
            confidence
          });
          foundRanges.add(rangeKey);
        }
      }
    }

    return detections;
  }

  /**
   * Generate appropriate mask for credit card numbers
   */
  getMask(detection: PIIDetection): string {
    return '[CREDIT_CARD_REDACTED]';
  }

  /**
   * Validate credit card number and return confidence score
   */
  private validateCreditCard(card: string): number {
    let confidence = 0.9; // Base confidence

    // Remove spaces and hyphens
    const cleanCard = card.replace(/[-\s]/g, '');

    // Check length
    if (cleanCard.length < 13 || cleanCard.length > 19) return 0;

    // Check if all digits
    if (!/^\d+$/.test(cleanCard)) return 0;

    // Validate Luhn algorithm
    if (!this.validateLuhn(cleanCard)) {
      confidence -= 0.4; // Reduce confidence for invalid Luhn
    }

    // Decrease confidence for suspicious patterns
    if (/^(\d)\1+$/.test(cleanCard)) confidence -= 0.5; // All same digits
    if (cleanCard === '1234567890123456') confidence -= 0.5; // Sequential test number

    return Math.max(0, Math.min(confidence, 1.0));
  }

  /**
   * Validate credit card number using Luhn algorithm
   */
  private validateLuhn(cardNumber: string): boolean {
    let sum = 0;
    let isEven = false;

    // Process digits from right to left
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i], 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }
}

/**
 * Factory function to create credit card detector
 */
export function createCreditCardDetector(): CreditCardDetector {
  return new CreditCardDetector();
}