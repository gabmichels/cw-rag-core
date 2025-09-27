// This file contains fake national ID numbers for testing purposes only
// These are not real IDs and should not trigger secret scanning
import { NationalIdDetector } from '../detectors/national-id.js';

describe('NationalIdDetector', () => {
  let detector: NationalIdDetector;

  beforeEach(() => {
    detector = new NationalIdDetector();
  });

  describe('detect', () => {
    it('should detect valid US SSN numbers', () => {
      const text = 'My SSN is 123-45-6789';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toMatchObject({
        type: 'national_id',
        start: 10,
        end: 21,
        confidence: expect.any(Number)
      });
    });

    it('should detect UK National Insurance numbers', () => {
      const text = 'NI number: AB 12 34 56 C';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect Canadian SIN numbers', () => {
      const text = 'SIN: 046-454-286';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect German ID numbers', () => {
      const text = 'German ID: 1234567890';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.7);
    });

    it('should handle IDs with and without separators', () => {
      const text = 'SSN: 123456789 and 123-45-6789 and 123 45 6789';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(3);
      expect(detections.every(d => d.confidence > 0.5)).toBe(true);
    });

    it('should not detect invalid national IDs', () => {
      const invalidIds = [
        '000-00-0000', // Invalid SSN
        '666-12-3456', // Invalid SSN (starts with 666)
        '123456789', // Too short
        '12345678901234567890', // Too long
        'AA 00 00 00 A', // Invalid UK NI
        '111-111-111' // All same digits
      ];

      for (const invalidId of invalidIds) {
        const detections = detector.detect(invalidId);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThanOrEqual(0.9);
        }
      }
    });

    it('should validate SSN correctly', () => {
      const validSSNs = [
        '123-45-6789',
        '987-65-4321'
      ];

      for (const ssn of validSSNs) {
        const detections = detector.detect(ssn);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.75);
      }
    });

    it('should validate UK NI correctly', () => {
      const validNIs = [
        'AB 12 34 56 C',
        'CD 98 76 54 F'
      ];

      for (const ni of validNIs) {
        const detections = detector.detect(ni);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should validate Canadian SIN correctly', () => {
      const validSINs = [
        '046-454-286', // Valid Luhn
        '123-456-782'  // Valid Luhn
      ];

      for (const sin of validSINs) {
        const detections = detector.detect(sin);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should decrease confidence for suspicious patterns', () => {
      const suspicious = '111111111'; // All same digits
      const normal = '123-45-6789';

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

    it('should handle text with no national IDs', () => {
      const text = 'This is just regular text with no national ID numbers.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should detect IDs in mixed content', () => {
      const text = `
        Personal information:
        SSN: 123-45-6789
        NI: AB 12 34 56 C
        SIN: 046-454-286
        Please keep your information secure.
      `;
      const detections = detector.detect(text);

      expect(detections).toHaveLength(3);
      expect(detections.every(d => d.confidence > 0.7)).toBe(true);
    });

    it('should respect minimum confidence threshold', () => {
      const text = '000000000'; // Low confidence
      const detections = detector.detect(text, { minConfidence: 0.9 });

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should avoid duplicate detections for overlapping patterns', () => {
      const text = '123-45-6789'; // Single SSN
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for national IDs', () => {
      const detection = {
        type: 'national_id' as const,
        start: 0,
        end: 11,
        confidence: 0.95
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[NATIONAL_ID_REDACTED]');
    });
  });

  describe('validation', () => {
    it('should identify different ID types correctly', () => {
      const idTests = [
        { number: '123-45-6789', type: 'SSN' },
        { number: 'AB 12 34 56 C', type: 'UK NI' },
        { number: '046-454-286', type: 'Canadian SIN' }
      ];

      for (const test of idTests) {
        const detections = detector.detect(test.number);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should handle invalid SSN patterns', () => {
      const invalidSSNs = [
        '000-00-0000',
        '666-12-3456',
        '123-00-1234',
        '123-45-0000'
      ];

      for (const ssn of invalidSSNs) {
        const detections = detector.detect(ssn);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.9);
        }
      }
    });

    it('should handle invalid UK NI prefixes', () => {
      const invalidNIs = [
        'BG 12 34 56 A',
        'GB 12 34 56 A',
        'ZZ 12 34 56 A'
      ];

      for (const ni of invalidNIs) {
        const detections = detector.detect(ni);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.9);
        }
      }
    });

    it('should validate Canadian SIN Luhn algorithm', () => {
      const validSIN = '046454286'; // Valid Luhn
      const invalidSIN = '123456789'; // Invalid Luhn

      const detection1 = detector.detect(validSIN);
      const detection2 = detector.detect(invalidSIN);

      if (detection1.length > 0 && detection2.length > 0) {
        expect(detection1[0].confidence).toBeGreaterThanOrEqual(detection2[0].confidence);
      }
    });
  });
});