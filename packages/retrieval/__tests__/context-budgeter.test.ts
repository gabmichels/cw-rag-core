/**
 * Unit tests for token budgeter
 */

import { TokenBudgeter, createTokenBudgeter } from '../src/context/budgeter.js';

describe('TokenBudgeter', () => {
  let budgeter: TokenBudgeter;

  beforeEach(() => {
    budgeter = createTokenBudgeter('gpt-4o', 1000);
  });

  afterEach(() => {
    budgeter.dispose();
  });

  describe('Token Counting', () => {
    it('should count tokens accurately', () => {
      const text = 'Hello world';
      const count = budgeter.countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('should handle empty text', () => {
      const count = budgeter.countTokens('');
      expect(count).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'This is a very long text '.repeat(100);
      const count = budgeter.countTokens(longText);
      expect(count).toBeGreaterThan(10);
    });
  });

  describe('Budget Checking', () => {
    it('should fit within budget', () => {
      const shortText = 'Short text';
      expect(budgeter.fitsBudget(shortText)).toBe(true);
    });

    it('should exceed budget for long text', () => {
      const longText = 'Very long text that exceeds the budget '.repeat(200);
      expect(budgeter.fitsBudget(longText)).toBe(false);
    });
  });

  describe('Token Estimation', () => {
    it('should provide fast estimation', () => {
      const text = 'This is a test sentence for estimation.';
      const estimate = budgeter.estimateTokens(text);
      const actual = budgeter.countTokens(text);

      // Estimate should be reasonably close (within 50%)
      const ratio = estimate / actual;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    });
  });

  describe('Truncation', () => {
    it('should truncate text to fit budget', () => {
      const longText = 'This is a very long text that should be truncated to fit within the token budget. '.repeat(100);
      const truncated = budgeter.truncateToBudget(longText, 100);

      expect(budgeter.countTokens(truncated)).toBeLessThanOrEqual(900); // budget - safety
      expect(truncated.length).toBeLessThan(longText.length);
    });

    it('should not truncate if already within budget', () => {
      const shortText = 'Short text';
      const truncated = budgeter.truncateToBudget(shortText, 100);

      expect(truncated).toBe(shortText);
    });
  });

  describe('Budget Management', () => {
    it('should update budget', () => {
      budgeter.setBudget(500);
      expect(budgeter.getBudget()).toBe(500);

      const longText = 'Text that fits 1000 but not 500 tokens. '.repeat(50);
      expect(budgeter.fitsBudget(longText)).toBe(false);
    });
  });
});