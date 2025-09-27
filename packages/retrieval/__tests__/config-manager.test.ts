import {
  RetrievalConfigManager,
  DEFAULT_FEATURE_FLAGS,
  configManager,
  RetrievalFeatureFlags
} from '../src/config-manager.js';

describe('RetrievalConfigManager', () => {
  let manager: RetrievalConfigManager;

  beforeEach(() => {
    manager = new RetrievalConfigManager();
  });

  describe('constructor', () => {
    it('should create manager with default flags when no flags provided', () => {
      const flags = manager.getFlags();

      expect(flags).toBeDefined();
      expect(typeof flags.adaptiveWeighting).toBe('boolean');
      expect(typeof flags.mmrEnabled).toBe('boolean');
      expect(typeof flags.minQualityScore).toBe('number');
    });

    it('should merge provided flags with defaults', () => {
      const customManager = new RetrievalConfigManager({
        adaptiveWeighting: true,
        minQualityScore: 0.8
      });

      const flags = customManager.getFlags();

      expect(flags.adaptiveWeighting).toBe(true);
      expect(flags.minQualityScore).toBe(0.8);
      // Other flags should still have defaults
      expect(flags.mmrEnabled).toBe(DEFAULT_FEATURE_FLAGS.mmrEnabled);
    });

    it('should override defaults with provided flags', () => {
      const customManager = new RetrievalConfigManager({
        retrievalK: 20
      });

      const flags = customManager.getFlags();

      expect(flags.retrievalK).toBe(20);
      expect(flags.minQualityScore).toBe(DEFAULT_FEATURE_FLAGS.minQualityScore);
    });
  });

  describe('getFlags', () => {
    it('should return a copy of the flags', () => {
      const flags1 = manager.getFlags();
      const flags2 = manager.getFlags();

      expect(flags1).toEqual(flags2);
      expect(flags1).not.toBe(flags2); // Should be different objects
    });

    it('should return all expected flag properties', () => {
      const flags = manager.getFlags();

      const expectedKeys: (keyof RetrievalFeatureFlags)[] = [
        'adaptiveWeighting',
        'mmrEnabled',
        'deduplicationEnabled',
        'ingestionGuardEnabled',
        'overlapEnabled',
        'chunkValidationEnabled',
        'contextPackingEnabled',
        'sectionReunificationEnabled',
        'answerabilityGuardEnabled',
        'cachingEnabled',
        'adaptiveEfEnabled',
        'minQualityScore',
        'maxContextTokens',
        'retrievalK'
      ];

      expectedKeys.forEach(key => {
        expect(flags).toHaveProperty(key);
      });
    });
  });

  describe('updateFlags', () => {
    it('should update existing flags', () => {
      const originalFlags = manager.getFlags();

      manager.updateFlags({
        adaptiveWeighting: !originalFlags.adaptiveWeighting,
        minQualityScore: 0.9
      });

      const updatedFlags = manager.getFlags();

      expect(updatedFlags.adaptiveWeighting).not.toBe(originalFlags.adaptiveWeighting);
      expect(updatedFlags.minQualityScore).toBe(0.9);
      expect(updatedFlags.mmrEnabled).toBe(originalFlags.mmrEnabled); // Unchanged
    });

    it('should handle partial updates', () => {
      const originalRetrievalK = manager.getFlags().retrievalK;

      manager.updateFlags({ retrievalK: originalRetrievalK + 5 });

      const updatedFlags = manager.getFlags();

      expect(updatedFlags.retrievalK).toBe(originalRetrievalK + 5);
    });

    it('should handle empty updates', () => {
      const originalFlags = manager.getFlags();

      manager.updateFlags({});

      const updatedFlags = manager.getFlags();

      expect(updatedFlags).toEqual(originalFlags);
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled boolean features', () => {
      // Create manager with specific flags
      const testManager = new RetrievalConfigManager({
        adaptiveWeighting: true,
        mmrEnabled: false
      });

      expect(testManager.isEnabled('adaptiveWeighting')).toBe(true);
      expect(testManager.isEnabled('mmrEnabled')).toBe(false);
    });

    it('should return false for disabled boolean features', () => {
      const testManager = new RetrievalConfigManager({
        cachingEnabled: false
      });

      expect(testManager.isEnabled('cachingEnabled')).toBe(false);
    });

    it('should return false for numeric features', () => {
      expect(manager.isEnabled('minQualityScore')).toBe(false);
      expect(manager.isEnabled('retrievalK')).toBe(false);
    });

    it('should handle invalid feature keys', () => {
      // TypeScript would catch this, but for runtime safety
      expect(manager.isEnabled('invalidKey' as any)).toBe(false);
    });
  });

  describe('getNumber', () => {
    it('should return numeric values for numeric features', () => {
      const testManager = new RetrievalConfigManager({
        minQualityScore: 0.75,
        retrievalK: 15
      });

      expect(testManager.getNumber('minQualityScore')).toBe(0.75);
      expect(testManager.getNumber('retrievalK')).toBe(15);
    });

    it('should return 0 for boolean features', () => {
      const testManager = new RetrievalConfigManager({
        adaptiveWeighting: true
      });

      expect(testManager.getNumber('adaptiveWeighting')).toBe(0);
    });

    it('should return 0 for invalid feature keys', () => {
      expect(manager.getNumber('invalidKey' as any)).toBe(0);
    });
  });

  describe('exportForTelemetry', () => {
    it('should export configuration with all flags', () => {
      const exported = manager.exportForTelemetry();

      expect(exported).toHaveProperty('features');
      expect(exported).toHaveProperty('timestamp');
      expect(exported).toHaveProperty('version', '1.0.0');

      expect(typeof exported.timestamp).toBe('string');
      expect(exported.features).toBeDefined();

      // Check that all flags are included
      const flags = manager.getFlags();
      Object.keys(flags).forEach(key => {
        expect(exported.features).toHaveProperty(key);
        expect(exported.features[key]).toBe(flags[key as keyof RetrievalFeatureFlags]);
      });
    });

    it('should create valid ISO timestamp', () => {
      const exported = manager.exportForTelemetry();

      expect(() => new Date(exported.timestamp)).not.toThrow();
      expect(exported.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('validate', () => {
    it('should return valid for default configuration', () => {
      const result = manager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate minQualityScore range', () => {
      const invalidManager = new RetrievalConfigManager({
        minQualityScore: -0.1
      });

      const result = invalidManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('minQualityScore must be between 0 and 1');

      const invalidManager2 = new RetrievalConfigManager({
        minQualityScore: 1.5
      });

      const result2 = invalidManager2.validate();

      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('minQualityScore must be between 0 and 1');
    });

    it('should validate maxContextTokens minimum', () => {
      const invalidManager = new RetrievalConfigManager({
        maxContextTokens: 500
      });

      const result = invalidManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxContextTokens must be at least 1000');
    });

    it('should validate retrievalK minimum', () => {
      const invalidManager = new RetrievalConfigManager({
        retrievalK: 0
      });

      const result = invalidManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('retrievalK must be at least 1');
    });

    it('should handle multiple validation errors', () => {
      const invalidManager = new RetrievalConfigManager({
        minQualityScore: -0.1,
        maxContextTokens: 500,
        retrievalK: 0
      });

      const result = invalidManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('minQualityScore must be between 0 and 1');
      expect(result.errors).toContain('maxContextTokens must be at least 1000');
      expect(result.errors).toContain('retrievalK must be at least 1');
    });

    it('should pass validation for valid edge cases', () => {
      const validManager = new RetrievalConfigManager({
        minQualityScore: 0,
        maxContextTokens: 1000,
        retrievalK: 1
      });

      const result = validManager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('DEFAULT_FEATURE_FLAGS', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should have expected default values', () => {
      expect(DEFAULT_FEATURE_FLAGS.minQualityScore).toBe(0.5);
      expect(DEFAULT_FEATURE_FLAGS.maxContextTokens).toBe(8000);
      expect(DEFAULT_FEATURE_FLAGS.retrievalK).toBe(12);
    });

    it('should respect QUERY_ADAPTIVE_WEIGHTS environment variable', () => {
      process.env.QUERY_ADAPTIVE_WEIGHTS = 'on';
      jest.resetModules();
      const { DEFAULT_FEATURE_FLAGS: flags } = require('../src/config-manager.js');

      expect(flags.adaptiveWeighting).toBe(true);
    });

    it('should respect MMR_ENABLED environment variable', () => {
      process.env.MMR_ENABLED = 'on';
      jest.resetModules();
      const { DEFAULT_FEATURE_FLAGS: flags } = require('../src/config-manager.js');

      expect(flags.mmrEnabled).toBe(true);
    });

    it('should default deduplicationEnabled to true', () => {
      expect(DEFAULT_FEATURE_FLAGS.deduplicationEnabled).toBe(true);
    });

    it('should respect DEDUPLICATION_ENABLED=off', () => {
      process.env.DEDUPLICATION_ENABLED = 'off';
      jest.resetModules();
      const { DEFAULT_FEATURE_FLAGS: flags } = require('../src/config-manager.js');

      expect(flags.deduplicationEnabled).toBe(false);
    });

    it('should respect numeric environment variables', () => {
      process.env.MIN_QUALITY_SCORE = '0.75';
      process.env.MAX_CONTEXT_TOKENS = '12000';
      process.env.RETRIEVAL_K_BASE = '20';

      jest.resetModules();
      const { DEFAULT_FEATURE_FLAGS: flags } = require('../src/config-manager.js');

      expect(flags.minQualityScore).toBe(0.75);
      expect(flags.maxContextTokens).toBe(12000);
      expect(flags.retrievalK).toBe(20);
    });

    it('should handle invalid numeric environment variables', () => {
      process.env.MIN_QUALITY_SCORE = 'invalid';
      process.env.MAX_CONTEXT_TOKENS = 'not-a-number';

      jest.resetModules();
      const { DEFAULT_FEATURE_FLAGS: flags } = require('../src/config-manager.js');

      expect(isNaN(flags.minQualityScore)).toBe(true); // parseFloat returns NaN for invalid input
      expect(isNaN(flags.maxContextTokens)).toBe(true); // parseInt returns NaN for invalid input
    });
  });

  describe('global configManager instance', () => {
    it('should be an instance of RetrievalConfigManager', () => {
      expect(configManager).toBeInstanceOf(RetrievalConfigManager);
    });

    it('should have default configuration', () => {
      const flags = configManager.getFlags();

      expect(flags).toBeDefined();
      expect(typeof flags.adaptiveWeighting).toBe('boolean');
      expect(typeof flags.minQualityScore).toBe('number');
    });

    it('should be configurable', () => {
      const originalValue = configManager.getFlags().retrievalK;

      configManager.updateFlags({ retrievalK: originalValue + 1 });

      expect(configManager.getFlags().retrievalK).toBe(originalValue + 1);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined flags in constructor', () => {
      const managerWithUndefined = new RetrievalConfigManager(undefined);

      expect(managerWithUndefined.getFlags()).toBeDefined();
    });

    it('should handle null values in updates', () => {
      // This shouldn't happen in practice, but test robustness
      const flags = manager.getFlags();

      manager.updateFlags({ retrievalK: null as any });

      // Should not crash, though behavior may be undefined
      expect(manager.getFlags()).toBeDefined();
    });

    it('should handle extreme numeric values', () => {
      const extremeManager = new RetrievalConfigManager({
        minQualityScore: Number.MAX_SAFE_INTEGER,
        maxContextTokens: Number.MAX_SAFE_INTEGER,
        retrievalK: Number.MAX_SAFE_INTEGER
      });

      const validation = extremeManager.validate();

      // Should still validate (though extreme values might not make sense)
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
    });
  });
});