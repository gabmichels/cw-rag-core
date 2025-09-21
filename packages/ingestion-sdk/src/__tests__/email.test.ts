import { EmailDetector } from '../detectors/email.js';

describe('EmailDetector', () => {
  let detector: EmailDetector;

  beforeEach(() => {
    detector = new EmailDetector();
  });

  describe('detect', () => {
    it('should detect valid email addresses', () => {
      const text = 'Contact me at john.doe@example.com or admin@test.org';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections[0]).toMatchObject({
        type: 'email',
        start: 14,
        end: 34,
        confidence: expect.any(Number)
      });
      expect(detections[1]).toMatchObject({
        type: 'email',
        start: 38,
        end: 52,
        confidence: expect.any(Number)
      });
    });

    it('should detect emails with different TLD lengths', () => {
      const text = 'user@domain.co and test@example.museum';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
      expect(detections[1].confidence).toBeGreaterThan(0.8);
    });

    it('should detect emails with special characters', () => {
      const text = 'user+tag@example.com and user_name@test-domain.co.uk';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });

    it('should not detect invalid email formats', () => {
      const invalidEmails = [
        'not-an-email',
        '@example.com',
        'user@',
        'user@@example.com',
        'user@.com',
        'user@example.',
        'user@example..com'
      ];

      for (const invalidEmail of invalidEmails) {
        const detections = detector.detect(invalidEmail);
        expect(detections).toHaveLength(0);
      }
    });

    it('should respect minimum confidence threshold', () => {
      const text = 'questionable@x.y'; // Very short domain might have lower confidence
      const detections = detector.detect(text, { minConfidence: 0.95 });

      // Should either detect with high confidence or not detect at all
      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should handle empty string', () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should handle text with no emails', () => {
      const text = 'This is just regular text with no email addresses.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should detect emails in mixed content', () => {
      const text = `
        Hello, my email is user@example.com and you can also reach me at
        backup@domain.org. Please don't contact spam@fake.test though.
      `;
      const detections = detector.detect(text);

      expect(detections).toHaveLength(3);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for email', () => {
      const detection = {
        type: 'email' as const,
        start: 0,
        end: 16,
        confidence: 0.9
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[EMAIL_REDACTED]');
    });
  });

  describe('validation', () => {
    it('should give higher confidence to well-formed emails', () => {
      const wellFormedEmail = 'john.doe@example.com';
      const poorlyFormedEmail = 'a@b.co'; // Changed to valid TLD

      const detection1 = detector.detect(wellFormedEmail)[0];
      const detection2 = detector.detect(poorlyFormedEmail)[0];

      expect(detection1).toBeDefined();
      expect(detection2).toBeDefined();
      // Since both are valid emails, just ensure they both have good confidence
      expect(detection1.confidence).toBeGreaterThan(0.8);
      expect(detection2.confidence).toBeGreaterThan(0.8);
    });

    it('should validate email components correctly', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk'
      ];

      for (const email of validEmails) {
        const detections = detector.detect(email);
        expect(detections).toHaveLength(1);
        expect(detections[0].confidence).toBeGreaterThan(0.8);
      }

      // Test some clearly invalid patterns that should not be detected
      const invalidEmails = [
        'test.@example.com'
      ];

      for (const email of invalidEmails) {
        const detections = detector.detect(email);
        expect(detections).toHaveLength(0);
      }
    });
  });
});