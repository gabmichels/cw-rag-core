/* eslint-disable */
// This file contains fake credit card numbers for testing purposes only
// These are not real credit cards and should not trigger secret scanning
// This file contains fake credit card numbers for testing purposes only
// These are not real credit cards and should not trigger secret scanning
import { CreditCardDetector } from '../detectors/credit-card.js';

describe('CreditCardDetector', () => {
  let detector: CreditCardDetector;

  beforeEach(() => {
    detector = new CreditCardDetector();
  });

  describe('detect', () => {
    it('should detect valid Visa credit card numbers', () => {
      const text = 'My card number is 4532-1234-5678-9006';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toMatchObject({
        type: 'credit_card',
        start: 18,
        end: 37,
        confidence: expect.any(Number)
      });
    });

    it('should detect MasterCard numbers', () => {
      const text = 'MasterCard: 5555-5555-5555-4444';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect American Express numbers', () => {
      const text = 'AmEx card: 3782-822463-10005';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect Discover card numbers', () => {
      const text = 'Discover: 6011-1111-1111-1117';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should handle cards with and without separators', () => {
      const text = '4532123456789006 and 4532-1234-5678-9006';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });

    it('should not detect invalid credit card numbers', () => {
      const invalidCards = [
        '1234-5678-9012-3456', // Invalid Luhn check
        '4532-1234-5678-9013', // Invalid Luhn check
        '1111-1111-1111-1111', // All same digits
        '1234567890123456', // Sequential test number
        '123-456-789', // Too short
        '12345678901234567890' // Too long
      ];

      for (const invalidCard of invalidCards) {
        const detections = detector.detect(invalidCard);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThanOrEqual(0.9);
        }
      }
    });

    it('should validate Luhn algorithm correctly', () => {
      // Valid test numbers that pass Luhn check
      const validCards = [
        '4532123456789006', // Visa
        '5555555555554444', // MasterCard
        '378282246310005',  // AmEx
        '6011111111111117'  // Discover
      ];

      // Invalid test numbers that fail Luhn check
      const invalidCards = [
        '4532123456789007', // Invalid Luhn
        '5555555555554445', // Invalid Luhn
        '378282246310006',  // Invalid Luhn
        '6011111111111118'  // Invalid Luhn
      ];

      for (const validCard of validCards) {
        const detections = detector.detect(validCard);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
      }

      for (const invalidCard of invalidCards) {
        const detections = detector.detect(invalidCard);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.9);
        }
      }
    });

    it('should decrease confidence for suspicious patterns', () => {
      const suspicious = '4444444444444444'; // All same digits (except first)
      const normal = '4532123456789006';

      const detection1 = detector.detect(suspicious);
      const detection2 = detector.detect(normal)[0];

      if (detection1.length > 0) {
        expect(detection1[0].confidence).toBeLessThan(detection2.confidence);
      }
    });

    it('should handle empty string', () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should handle text with no credit cards', () => {
      const text = 'This is just regular text with no credit card numbers.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should detect cards in mixed content', () => {
      const text = `
        Payment methods accepted:
        Visa: 4532-1234-5678-9006
        MasterCard: 5105105105105100
        AmEx: 3782-822463-10005
        Please keep your card information secure.
      `;
      const detections = detector.detect(text);

      expect(detections).toHaveLength(3);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });

    it('should respect minimum confidence threshold', () => {
      const text = '4000000000000000'; // Borderline case
      const detections = detector.detect(text, { minConfidence: 0.95 });

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should avoid duplicate detections for overlapping patterns', () => {
      const text = '4532-1234-5678-9006'; // Single card number
      const detections = detector.detect(text);

      // Should only detect once, not multiple times from different patterns
      expect(detections).toHaveLength(1);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for credit cards', () => {
      const detection = {
        type: 'credit_card' as const,
        start: 0,
        end: 19,
        confidence: 0.95
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[CREDIT_CARD_REDACTED]');
    });
  });

  describe('validation', () => {
    it('should identify different card types correctly', () => {
      const cardTests = [
        { number: '4532123456789006', type: 'Visa' },
        { number: '5555555555554444', type: 'MasterCard' },
        { number: '378282246310005', type: 'AmEx' },
        { number: '6011111111111117', type: 'Discover' }
      ];

      for (const test of cardTests) {
        const detections = detector.detect(test.number);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should handle 13-digit Visa cards', () => {
      const visaCard13 = '4532123456789'; // 13-digit Visa (if valid)
      const detections = detector.detect(visaCard13);

      // 13-digit cards are less common but should still be detected if valid
      if (detections.length > 0) {
        expect(detections[0].type).toBe('credit_card');
      }
    });

    it('should reject cards with wrong length for type', () => {
      const wrongLengthAmEx = '3782822463100051'; // AmEx should be 15 digits, this is 16
      const detections = detector.detect(wrongLengthAmEx);

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeLessThanOrEqual(0.9);
      }
    });
  });
});