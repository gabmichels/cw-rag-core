import { IBANDetector } from '../detectors/iban.js';

describe('IBANDetector', () => {
  let detector: IBANDetector;

  beforeEach(() => {
    detector = new IBANDetector();
  });

  describe('detect', () => {
    it('should detect valid IBAN numbers', () => {
      const text = 'IBAN: GB29 NWBK 6016 1331 9268 19';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toMatchObject({
        type: 'iban',
        start: 6,
        end: 33,
        confidence: expect.any(Number)
      });
    });

    it('should detect IBAN with different country codes', () => {
      const ibanTests = [
        'NL91 ABNA 0417 1643 00', // Netherlands
        'FR14 2004 1010 0505 0001 3M02 606', // France
        'ES91 2100 0418 4502 0005 1332' // Spain
      ];

      for (const iban of ibanTests) {
        const detections = detector.detect(iban);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThan(0.8);
      }
    });

    it('should handle IBANs with and without spaces', () => {
      const text = 'IBAN: GB29 NWBK 6016 1331 9268 19 and DE89370400440532013000';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });

    it('should not detect invalid IBAN numbers', () => {
      const invalidIbans = [
        'GB29 NWBK 6016 1331 9268 1', // Too short
        'GB29 NWBK 6016 1331 9268 19123', // Too long
        'XX29 NWBK 6016 1331 9268 19', // Invalid country
        'GB2A NWBK 6016 1331 9268 19', // Invalid check digits
        '12345678901234567890' // No country code
      ];

      for (const invalidIban of invalidIbans) {
        const detections = detector.detect(invalidIban);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThanOrEqual(0.9);
        }
      }
    });

    it('should validate IBAN check digits correctly', () => {
      const validIBAN = 'GB29 NWBK 6016 1331 9268 19'; // Valid
      const invalidIBAN = 'GB30 NWBK 6016 1331 9268 19'; // Invalid check digits

      const detection1 = detector.detect(validIBAN);
      const detection2 = detector.detect(invalidIBAN);

      expect(detection1).toHaveLength(1);
      expect(detection1[0].confidence).toBeGreaterThan(0.9);

      if (detection2.length > 0) {
        expect(detection2[0].confidence).toBeLessThan(0.9);
      }
    });

    it('should validate country-specific lengths', () => {
      const validLengthIBAN = 'DE89 3704 0044 0532 0130 00'; // Germany: 22 chars
      const invalidLengthIBAN = 'DE89 3704 0044 0532 0130 000'; // 23 chars, invalid for DE

      const detection1 = detector.detect(validLengthIBAN);
      const detection2 = detector.detect(invalidLengthIBAN);

      expect(detection1).toHaveLength(1);
      expect(detection1[0].confidence).toBeGreaterThan(0.9);

      if (detection2.length > 0) {
        expect(detection2[0].confidence).toBeLessThan(0.9);
      }
    });

    it('should handle empty string', () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should handle text with no IBANs', () => {
      const text = 'This is just regular text with no IBAN numbers.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should detect IBANs in mixed content', () => {
      const text = `
        Bank details:
        IBAN: GB29 NWBK 6016 1331 9268 19
        BIC: NWBKGB2L
        Account: 12345678
        Please keep your banking information secure.
      `;
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should respect minimum confidence threshold', () => {
      const text = 'GB00 0000 0000 0000 0000 00'; // Invalid but matches format
      const detections = detector.detect(text, { minConfidence: 0.95 });

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should avoid duplicate detections for overlapping patterns', () => {
      const text = 'GB29 NWBK 6016 1331 9268 19'; // Single IBAN
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
    });

    it('should handle IBANs with minimum and maximum lengths', () => {
      const shortIBAN = 'NO93 8601 1117 947'; // Norway: 15 chars
      const longIBAN = 'CR05 0152 0200 1026 2840 66'; // Costa Rica: 22 chars

      const detection1 = detector.detect(shortIBAN);
      const detection2 = detector.detect(longIBAN);

      expect(detection1).toHaveLength(1);
      expect(detection2).toHaveLength(1);
      expect(detection1[0].confidence).toBeGreaterThan(0.8);
      expect(detection2[0].confidence).toBeGreaterThan(0.8);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for IBAN numbers', () => {
      const detection = {
        type: 'iban' as const,
        start: 0,
        end: 22,
        confidence: 0.95
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[IBAN_REDACTED]');
    });
  });

  describe('validation', () => {
    it('should validate mod-97 algorithm correctly', () => {
      const validIBANs = [
        'GB29 NWBK 6016 1331 9268 19',
        'DE89 3704 0044 0532 0130 00',
        'FR14 2004 1010 0505 0001 3M02 606'
      ];

      const invalidIBANs = [
        'GB30 NWBK 6016 1331 9268 19', // Wrong check digits
        'DE90 3704 0044 0532 0130 00' // Wrong check digits
      ];

      for (const iban of validIBANs) {
        const detections = detector.detect(iban);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThan(0.9);
      }

      for (const iban of invalidIBANs) {
        const detections = detector.detect(iban);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.9);
        }
      }
    });

    it('should handle unknown country codes', () => {
      const unknownCountryIBAN = 'ZZ12 3456 7890 1234 5678 90'; // ZZ not in mapping
      const detections = detector.detect(unknownCountryIBAN);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.5); // Base confidence
    });

    it('should validate check digits format', () => {
      const invalidCheckDigits = 'GB2A NWBK 6016 1331 9268 19'; // Non-numeric check digits
      const detections = detector.detect(invalidCheckDigits);

      expect(detections).toHaveLength(0); // Should not detect due to invalid format
    });

    it('should handle IBAN rearrangement and mod-97 calculation', () => {
      // Test edge cases for mod-97
      const edgeCaseIBAN = 'AD12 0001 2030 2003 5910 0100'; // Andorra IBAN
      const detections = detector.detect(edgeCaseIBAN);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });
  });
});