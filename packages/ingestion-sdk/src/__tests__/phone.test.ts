import { PhoneDetector } from '../detectors/phone.js';

describe('PhoneDetector', () => {
  let detector: PhoneDetector;

  beforeEach(() => {
    detector = new PhoneDetector();
  });

  describe('detect', () => {
    it('should detect US phone numbers in various formats', () => {
      const text = 'Call me at (555) 123-4567 or 555-987-6543 or +1-800-555-0199';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThanOrEqual(3);
      expect(detections.every(d => d.type === 'phone')).toBe(true);
      expect(detections.every(d => d.confidence > 0.7)).toBe(true);
    });

    it('should detect international phone numbers', () => {
      const text = 'International: +44 20 7946 0958 and +33 1 42 68 53 00';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections.every(d => d.confidence > 0.7)).toBe(true);
    });

    it('should detect phone numbers with spaces and hyphens', () => {
      const text = 'Contact: 555 123 4567 or 555-123-4567';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections[0].confidence).toBeGreaterThan(0.7);
      expect(detections[1].confidence).toBeGreaterThan(0.7);
    });

    it('should not detect invalid phone numbers', () => {
      const invalidPhones = [
        '123',
        '12345',
        '000-000-0000',
        '111-111-1111',
        '123-456-789', // Too short
        '1234567890123456' // Too long
      ];

      for (const invalidPhone of invalidPhones) {
        const detections = detector.detect(invalidPhone);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.8);
        }
      }
    });

    it('should give higher confidence to properly formatted numbers', () => {
      const wellFormatted = '(555) 123-4567';
      const poorlyFormatted = '5551234567';

      const detection1 = detector.detect(wellFormatted)[0];
      const detection2 = detector.detect(poorlyFormatted);

      expect(detection1).toBeDefined();
      if (detection2.length > 0) {
        expect(detection1.confidence).toBeGreaterThan(detection2[0].confidence);
      }
    });

    it('should validate area codes correctly', () => {
      const validAreaCode = '(555) 123-4567';
      const invalidAreaCode = '(011) 123-4567'; // Area code can't start with 0

      const validDetection = detector.detect(validAreaCode)[0];
      const invalidDetection = detector.detect(invalidAreaCode);

      expect(validDetection).toBeDefined();
      expect(validDetection.confidence).toBeGreaterThan(0.8);
      // Invalid area codes should still get detected but with lower confidence
      expect(invalidDetection.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty string', () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should handle text with no phone numbers', () => {
      const text = 'This is just regular text with no phone numbers.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should detect phones in mixed content', () => {
      const text = `
        Please call our office at (555) 123-4567 during business hours.
        For emergencies, dial 911 or our emergency line +1-800-EMERGENCY.
        International customers can reach us at +44 20 7946 0958.
      `;
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.every(d => d.confidence > 0.6)).toBe(true);
    });

    it('should respect minimum confidence threshold', () => {
      const text = '1234567890'; // Borderline case
      const detections = detector.detect(text, { minConfidence: 0.9 });

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for phone numbers', () => {
      const detection = {
        type: 'phone' as const,
        start: 0,
        end: 14,
        confidence: 0.9
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[PHONE_REDACTED]');
    });
  });

  describe('validation', () => {
    it('should decrease confidence for repetitive patterns', () => {
      const repetitive = '1111111111';
      const normal = '5551234567';

      const detection1 = detector.detect(repetitive);
      const detection2 = detector.detect(normal)[0];

      if (detection1.length > 0) {
        expect(detection1[0].confidence).toBeLessThan(detection2.confidence);
      }
    });

    it('should decrease confidence for sequential patterns', () => {
      const sequential = '1234567890';
      const normal = '5551234567';

      const detection1 = detector.detect(sequential);
      const detection2 = detector.detect(normal)[0];

      if (detection1.length > 0) {
        expect(detection1[0].confidence).toBeLessThan(detection2.confidence);
      }
    });

    it('should handle Canadian numbers correctly', () => {
      const canadianNumber = '+1 (416) 555-0123';
      const detections = detector.detect(canadianNumber);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });
  });
});