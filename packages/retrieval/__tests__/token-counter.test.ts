/**
 * Unit tests for token counting utilities
 */

import {
  BGETokenCounter,
  OpenAITokenCounter,
  CustomTokenCounter,
  CachedTokenCounter,
  createTokenCounter,
  TokenizerConfig
} from '../src/token-counter.js';

describe('TokenCounter', () => {
  describe('BGETokenCounter', () => {
    let counter: BGETokenCounter;

    beforeEach(() => {
      const config: TokenizerConfig = {
        model: 'bge-small-en-v1.5',
        type: 'transformers',
        maxTokens: 512,
        safetyMargin: 0.1
      };
      counter = new BGETokenCounter(config);
    });

    it('should count tokens for simple text', async () => {
      const result = await counter.countTokens('Hello world test');

      expect(result.characterCount).toBe(16);
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBe(result.tokenCount);
      expect(result.safeTokenLimit).toBe(460); // 512 * 0.9
    });

    it('should handle empty text', async () => {
      const result = await counter.countTokens('');

      expect(result.characterCount).toBe(0);
      expect(result.tokenCount).toBe(0);
      expect(result.isWithinLimit).toBe(true);
    });

    it('should identify text within limits', async () => {
      const shortText = 'This is a short text';
      const result = await counter.countTokens(shortText);

      expect(result.isWithinLimit).toBe(true);
    });

    it('should identify text exceeding limits', async () => {
      // Create text that exceeds 460 tokens (estimated ~1470 characters)
      const longText = 'A'.repeat(2000);
      const result = await counter.countTokens(longText);

      expect(result.isWithinLimit).toBe(false);
      expect(result.tokenCount).toBeGreaterThan(result.safeTokenLimit);
    });
  });

  describe('OpenAITokenCounter', () => {
    let counter: OpenAITokenCounter;

    beforeEach(() => {
      const config: TokenizerConfig = {
        model: 'text-embedding-ada-002',
        type: 'tiktoken',
        maxTokens: 8191,
        safetyMargin: 0.1
      };
      counter = new OpenAITokenCounter(config);
    });

    it('should use different character-to-token ratio', async () => {
      const text = 'Hello world test';
      const result = await counter.countTokens(text);

      // OpenAI models typically have ~4 chars per token vs BGE's ~3.2
      expect(result.tokenCount).toBeLessThan(Math.ceil(text.length / 3.2));
    });
  });

  describe('CustomTokenCounter', () => {
    it('should use custom character-to-token ratio', async () => {
      const config: TokenizerConfig = {
        model: 'custom-model',
        type: 'custom',
        maxTokens: 1000,
        safetyMargin: 0.2
      };
      const counter = new CustomTokenCounter(config, 5.0); // 5 chars per token

      const text = 'Hello world test'; // 17 characters
      const result = await counter.countTokens(text);

      expect(result.tokenCount).toBe(Math.ceil(17 / 5.0)); // 4 tokens
      expect(result.safeTokenLimit).toBe(800); // 1000 * 0.8
    });
  });

  describe('CachedTokenCounter', () => {
    let baseCounter: BGETokenCounter;
    let cachedCounter: CachedTokenCounter;

    beforeEach(() => {
      const config: TokenizerConfig = {
        model: 'bge-small-en-v1.5',
        type: 'transformers',
        maxTokens: 512,
        safetyMargin: 0.1
      };
      baseCounter = new BGETokenCounter(config);
      cachedCounter = new CachedTokenCounter(baseCounter);
    });

    it('should cache results for identical text', async () => {
      const text = 'Hello world test';

      const result1 = await cachedCounter.countTokens(text);
      const result2 = await cachedCounter.countTokens(text);

      expect(result1).toEqual(result2);
    });

    it('should return different results for different text', async () => {
      const text1 = 'Hello world';
      const text2 = 'Different text';

      const result1 = await cachedCounter.countTokens(text1);
      const result2 = await cachedCounter.countTokens(text2);

      expect(result1.tokenCount).not.toBe(result2.tokenCount);
    });

    it('should clear cache correctly', async () => {
      const text = 'Hello world test';
      await cachedCounter.countTokens(text);

      cachedCounter.clearCache();

      // Should work fine after cache clear
      const result = await cachedCounter.countTokens(text);
      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('createTokenCounter factory', () => {
    it('should create BGE counter for transformers type with bge model', () => {
      const config: TokenizerConfig = {
        model: 'bge-small-en-v1.5',
        type: 'transformers',
        maxTokens: 512,
        safetyMargin: 0.1
      };

      const counter = createTokenCounter(config);
      expect(counter).toBeInstanceOf(BGETokenCounter);
    });

    it('should create OpenAI counter for tiktoken type', () => {
      const config: TokenizerConfig = {
        model: 'text-embedding-ada-002',
        type: 'tiktoken',
        maxTokens: 8191,
        safetyMargin: 0.1
      };

      const counter = createTokenCounter(config);
      expect(counter).toBeInstanceOf(OpenAITokenCounter);
    });

    it('should create custom counter for custom type', () => {
      const config: TokenizerConfig = {
        model: 'custom-model',
        type: 'custom',
        maxTokens: 1000,
        safetyMargin: 0.1
      };

      const counter = createTokenCounter(config);
      expect(counter).toBeInstanceOf(CustomTokenCounter);
    });

    it('should throw error for unsupported type', () => {
      const config: TokenizerConfig = {
        model: 'some-model',
        type: 'unsupported' as any,
        maxTokens: 1000,
        safetyMargin: 0.1
      };

      expect(() => createTokenCounter(config)).toThrow('Unsupported tokenizer type');
    });
  });

  describe('Edge cases', () => {
    let counter: BGETokenCounter;

    beforeEach(() => {
      const config: TokenizerConfig = {
        model: 'bge-small-en-v1.5',
        type: 'transformers',
        maxTokens: 512,
        safetyMargin: 0.1
      };
      counter = new BGETokenCounter(config);
    });

    it('should handle very long text', async () => {
      const longText = 'Lorem ipsum '.repeat(1000); // ~12,000 characters
      const result = await counter.countTokens(longText);

      expect(result.characterCount).toBe(longText.length);
      expect(result.tokenCount).toBeGreaterThan(1000);
      expect(result.isWithinLimit).toBe(false);
    });

    it('should handle special characters', async () => {
      const specialText = '🚀 Hello 世界 #test @user 50% 100$ €25';
      const result = await counter.countTokens(specialText);

      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.characterCount).toBe(specialText.length);
    });

    it('should handle newlines and tabs', async () => {
      const formattedText = 'Line 1\nLine 2\t\tTabbed';
      const result = await counter.countTokens(formattedText);

      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.characterCount).toBe(formattedText.length);
    });
  });
});