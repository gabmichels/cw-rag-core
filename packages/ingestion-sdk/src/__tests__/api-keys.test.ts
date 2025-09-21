import { APIKeyDetector, AWSKeyDetector, JWTDetector } from '../detectors/api-keys.js';

describe('APIKeyDetector', () => {
  let detector: APIKeyDetector;

  beforeEach(() => {
    detector = new APIKeyDetector();
  });

  describe('detect', () => {
    it('should detect AWS Access Key IDs', () => {
      const text = 'AWS key: AKIAIOSFODNN7EXAMPLE and another AKIABCDEFGHIJKLMNOP';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections.every(d => d.confidence > 0.9)).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      const text = 'GitHub token: ghp_1234567890abcdef1234567890abcdef1234';
      const detections = detector.detect(text, { minConfidence: 0.8 });

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections.every(d => d.confidence > 0.8)).toBe(true);
    });

    it('should detect Stripe API keys', () => {
      const text = 'Stripe keys: fake_secret_key_abcd1234efgh5678ijkl and mock_public_key_wxyz9876mnop5432qrst';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(2);
      expect(detections.every(d => d.confidence > 0.9)).toBe(true);
    });

    it('should detect Google API keys', () => {
      const text = 'Google API: AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.9);
    });

    it('should detect bearer tokens', () => {
      const text = 'Authorization: Bearer abc123def456ghi789jkl012mno345pqr678';
      const detections = detector.detect(text, { minConfidence: 0.6 });

      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections.every(d => d.confidence > 0.6)).toBe(true);
    });

    it('should detect generic hex API keys', () => {
      const text = 'API key: a1b2c3d4e5f67890abcdef1234567890abcdef12';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.6);
    });

    it('should not detect test/example keys', () => {
      const testKeys = [
        'test123456789012345678901234567890',
        'example_api_key_1234567890',
        'demo12345678901234567890123456789012'
      ];

      for (const testKey of testKeys) {
        const detections = detector.detect(testKey);
        if (detections.length > 0) {
          expect(detections[0].confidence).toBeLessThan(0.8);
        }
      }
    });

    it('should handle empty string', () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should respect minimum confidence threshold', () => {
      const text = 'questionable_key_12345'; // Low entropy
      const detections = detector.detect(text, { minConfidence: 0.9 });

      if (detections.length > 0) {
        expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should avoid duplicate detections', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE'; // Should match multiple patterns but detect once
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for API keys', () => {
      const detection = {
        type: 'api_key' as const,
        start: 0,
        end: 20,
        confidence: 0.9
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[API_KEY_REDACTED]');
    });
  });
});

describe('AWSKeyDetector', () => {
  let detector: AWSKeyDetector;

  beforeEach(() => {
    detector = new AWSKeyDetector();
  });

  describe('detect', () => {
    it('should detect AWS Access Key IDs with high confidence', () => {
      const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThanOrEqual(0.95);
      expect(detections[0].type).toBe('aws_key');
    });

    it('should detect AWS Secret Access Keys', () => {
      const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });

    it('should detect AWS Session Tokens', () => {
      const text = 'SESSION_TOKEN=' + 'A'.repeat(100); // Long token format
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for AWS keys', () => {
      const detection = {
        type: 'aws_key' as const,
        start: 0,
        end: 20,
        confidence: 0.95
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[AWS_KEY_REDACTED]');
    });
  });
});

describe('JWTDetector', () => {
  let detector: JWTDetector;

  beforeEach(() => {
    detector = new JWTDetector();
  });

  describe('detect', () => {
    it('should detect valid JWT tokens', () => {
      const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const detections = detector.detect(validJWT);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.9);
      expect(detections[0].type).toBe('jwt_token');
    });

    it('should not detect invalid JWT formats', () => {
      const invalidJWTs = [
        'eyJhbGciOiJIUzI1NiJ9.invalid', // Missing signature
        'invalid.jwt.format', // Not base64url
        'eyJ.incomplete' // Incomplete
      ];

      for (const invalidJWT of invalidJWTs) {
        const detections = detector.detect(invalidJWT);
        expect(detections).toHaveLength(0);
      }
    });

    it('should validate JWT structure', () => {
      const validStructure = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature';
      const invalidStructure = 'not-a-jwt-token';

      const validDetections = detector.detect(validStructure);
      const invalidDetections = detector.detect(invalidStructure);

      expect(validDetections).toHaveLength(1);
      expect(invalidDetections).toHaveLength(0);
    });

    it('should handle JWT tokens in context', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBeGreaterThan(0.8);
    });
  });

  describe('getMask', () => {
    it('should return appropriate mask for JWT tokens', () => {
      const detection = {
        type: 'jwt_token' as const,
        start: 0,
        end: 50,
        confidence: 0.9
      };

      const mask = detector.getMask(detection);
      expect(mask).toBe('[JWT_TOKEN_REDACTED]');
    });
  });
});

describe('API Key Detection Integration', () => {
  it('should detect multiple API key types in one text', () => {
    const detector = new APIKeyDetector();
    const text = `
      Configuration:
      AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
      GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef1234
      STRIPE_KEY=fake_secret_key_abcd1234efgh5678ijkl
      GOOGLE_API_KEY=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI
    `;

    const detections = detector.detect(text);
    expect(detections.length).toBeGreaterThanOrEqual(3);
    expect(detections.every(d => d.confidence > 0.8)).toBe(true);
  });

  it('should calculate entropy correctly for random strings', () => {
    const detector = new APIKeyDetector();
    const highEntropy = 'xK7mP9nR2wQ8uY3vB6cE1dA5fG4hJ0sL'; // Random-looking
    const lowEntropy = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // All same character

    const highEntropyDetections = detector.detect(highEntropy);
    const lowEntropyDetections = detector.detect(lowEntropy);

    if (highEntropyDetections.length > 0 && lowEntropyDetections.length > 0) {
      expect(highEntropyDetections[0].confidence).toBeGreaterThan(lowEntropyDetections[0].confidence);
    }
  });
});