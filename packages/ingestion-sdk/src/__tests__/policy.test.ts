// This file contains fake PII data for testing purposes only
// These are not real data and should not trigger secret scanning
import { PIIPolicyEngine, applyRedaction, summarizeFindings, createDefaultPolicy, createAllowlistPolicy, createBlockPolicy } from '../policy.js';
import { PIIPolicy, PIIDetection } from '../types.js';

describe('PIIPolicyEngine', () => {
  let engine: PIIPolicyEngine;

  beforeEach(() => {
    engine = new PIIPolicyEngine();
  });

  describe('applyRedaction', () => {
    it('should mask PII when policy mode is mask', () => {
      const text = 'Contact john.doe@example.com or call (555) 123-4567';
      const policy: PIIPolicy = { mode: 'mask' };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(false);
      expect(result.maskedText).toContain('[EMAIL_REDACTED]');
      expect(result.maskedText).toContain('[PHONE_REDACTED]');
      expect(result.redactions).toHaveLength(2);
      expect(result.originalLength).toBe(text.length);
    });

    it('should return original text when policy mode is off', () => {
      const text = 'Contact john.doe@example.com or call (555) 123-4567';
      const policy: PIIPolicy = { mode: 'off' };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(false);
      expect(result.maskedText).toBe(text);
      expect(result.redactions).toHaveLength(0);
      expect(result.originalLength).toBe(text.length);
    });

    it('should block content when policy mode is block and PII is found', () => {
      const text = 'Contact john.doe@example.com for more info';
      const policy: PIIPolicy = { mode: 'block' };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(true);
      expect(result.maskedText).toBe('[CONTENT_BLOCKED_DUE_TO_PII]');
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe('email');
      expect(result.redactions[0].count).toBe(1);
    });

    it('should handle allowlist mode correctly', () => {
      const text = 'Email: user@example.com Phone: (555) 123-4567';
      const policy: PIIPolicy = {
        mode: 'allowlist',
        allowedTypes: ['email']
      };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(false);
      expect(result.maskedText).toContain('user@example.com'); // Email should remain
      expect(result.maskedText).toContain('[PHONE_REDACTED]'); // Phone should be masked
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe('phone');
    });

    it('should apply source overrides correctly', () => {
      const text = 'Contact john.doe@example.com for support';
      const policy: PIIPolicy = {
        mode: 'mask',
        sourceOverrides: {
          '*.log': { mode: 'block' },
          'config/*': { mode: 'off' }
        }
      };

      // Test with log file - should block
      const logResult = engine.applyRedaction(text, policy, 'app.log');
      expect(logResult.blocked).toBe(true);

      // Test with config file - should be off
      const configResult = engine.applyRedaction(text, policy, 'config/settings.json');
      expect(configResult.blocked).toBe(false);
      expect(configResult.maskedText).toBe(text);

      // Test with regular file - should mask
      const regularResult = engine.applyRedaction(text, policy, 'data.txt');
      expect(regularResult.blocked).toBe(false);
      expect(regularResult.maskedText).toContain('[EMAIL_REDACTED]');
    });

    it('should handle overlapping PII detections', () => {
      const text = 'My number is 555-123-4567 and backup is 555-987-6543';
      const policy: PIIPolicy = { mode: 'mask' };

      const result = engine.applyRedaction(text, policy);

      expect(result.redactions).toHaveLength(1); // Should group by type
      expect(result.redactions[0].type).toBe('phone');
      expect(result.redactions[0].count).toBe(2);
    });

    it('should handle text with no PII', () => {
      const text = 'This is just regular text with no sensitive information.';
      const policy: PIIPolicy = { mode: 'mask' };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(false);
      expect(result.maskedText).toBe(text);
      expect(result.redactions).toHaveLength(0);
    });

    it('should handle multiple PII types correctly', () => {
      const text = `
        Personal Info:
        Email: john.doe@example.com
        Phone: (555) 123-4567
        Card: 4532-1234-5678-9006
        API Key: AKIAIOSFODNN7EXAMPLE
      `;
      const policy: PIIPolicy = { mode: 'mask' };

      const result = engine.applyRedaction(text, policy);

      expect(result.blocked).toBe(false);
      expect(result.redactions.length).toBeGreaterThan(0);

      const redactionTypes = result.redactions.map(r => r.type);
      expect(redactionTypes).toContain('email');
      expect(redactionTypes).toContain('phone');
      expect(redactionTypes).toContain('credit_card');
      expect(redactionTypes).toContain('api_key');
    });
  });

  describe('source path matching', () => {
    it('should match glob patterns correctly', () => {
      const policy: PIIPolicy = {
        mode: 'mask',
        sourceOverrides: {
          '*.log': { mode: 'block' },
          'temp/*': { mode: 'off' },
          'data/*.json': { mode: 'allowlist', allowedTypes: ['email'] }
        }
      };

      const text = 'Email: test@example.com';

      // Test log file pattern
      const logResult = engine.applyRedaction(text, policy, 'application.log');
      expect(logResult.blocked).toBe(true);

      // Test temp directory pattern
      const tempResult = engine.applyRedaction(text, policy, 'temp/cache.txt');
      expect(tempResult.maskedText).toBe(text);

      // Test JSON file in data directory
      const jsonResult = engine.applyRedaction(text, policy, 'data/users.json');
      expect(jsonResult.maskedText).toBe(text); // Email should be allowed
    });
  });
});

describe('applyRedaction function', () => {
  it('should work as a convenience function', () => {
    const text = 'Contact user@example.com for help';
    const policy: PIIPolicy = { mode: 'mask' };

    const result = applyRedaction(text, policy);

    expect(result.maskedText).toContain('[EMAIL_REDACTED]');
    expect(result.redactions).toHaveLength(1);
  });
});

describe('summarizeFindings function', () => {
  it('should summarize detections without exposing raw values', () => {
    const detections: PIIDetection[] = [
      { type: 'email', start: 0, end: 16, confidence: 0.9 },
      { type: 'email', start: 20, end: 36, confidence: 0.9 },
      { type: 'phone', start: 40, end: 54, confidence: 0.8 },
      { type: 'credit_card', start: 60, end: 75, confidence: 0.95 }
    ];

    const summary = summarizeFindings(detections);

    expect(summary).toHaveLength(3);
    expect(summary).toContainEqual({ type: 'email', count: 2 });
    expect(summary).toContainEqual({ type: 'phone', count: 1 });
    expect(summary).toContainEqual({ type: 'credit_card', count: 1 });
  });

  it('should handle empty detections array', () => {
    const summary = summarizeFindings([]);
    expect(summary).toHaveLength(0);
  });
});

describe('policy creation helpers', () => {
  describe('createDefaultPolicy', () => {
    it('should create a default mask policy', () => {
      const policy = createDefaultPolicy();

      expect(policy.mode).toBe('mask');
      expect(policy.allowedTypes).toBeUndefined();
      expect(policy.sourceOverrides).toBeUndefined();
    });

    it('should include tenant ID when provided', () => {
      const policy = createDefaultPolicy('tenant-123');

      expect(policy.tenantId).toBe('tenant-123');
    });
  });

  describe('createAllowlistPolicy', () => {
    it('should create an allowlist policy', () => {
      const allowedTypes: ['email', 'phone'] = ['email', 'phone'];
      const policy = createAllowlistPolicy(allowedTypes);

      expect(policy.mode).toBe('allowlist');
      expect(policy.allowedTypes).toEqual(allowedTypes);
    });
  });

  describe('createBlockPolicy', () => {
    it('should create a block policy', () => {
      const policy = createBlockPolicy();

      expect(policy.mode).toBe('block');
      expect(policy.allowedTypes).toBeUndefined();
    });
  });
});

describe('edge cases and error handling', () => {
  let engine: PIIPolicyEngine;

  beforeEach(() => {
    engine = new PIIPolicyEngine();
  });

  it('should handle very long text efficiently', () => {
    const longText = 'Contact user@example.com for info. '.repeat(1000);
    const policy: PIIPolicy = { mode: 'mask' };

    const startTime = Date.now();
    const result = engine.applyRedaction(longText, policy);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    expect(result.redactions[0].count).toBe(1000); // Should detect all emails
  });

  it('should handle malformed input gracefully', () => {
    const emptyText = '';
    const policy: PIIPolicy = { mode: 'mask' };

    const result = engine.applyRedaction(emptyText, policy);

    expect(result.maskedText).toBe('');
    expect(result.redactions).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });

  it('should handle invalid source paths gracefully', () => {
    const text = 'Email: test@example.com';
    const policy: PIIPolicy = {
      mode: 'mask',
      sourceOverrides: {
        'invalid/**': { mode: 'block' }
      }
    };

    const result = engine.applyRedaction(text, policy, null as any);

    expect(result.maskedText).toContain('[EMAIL_REDACTED]');
  });
});