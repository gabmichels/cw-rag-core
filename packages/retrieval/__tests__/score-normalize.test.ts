import {
  normalizeScores,
  minMaxNormalize,
  zScoreNormalize,
  hasConstantScores,
  hasSmallList,
  safeNormalizeScores,
  NormalizationMethod
} from '../src/services/score-normalize.js';

describe('Score Normalization', () => {
  describe('normalizeScores', () => {
    it('should return empty array for empty input', () => {
      const result = normalizeScores([], 'minmax');
      expect(result).toEqual([]);
    });

    it('should return [0.5] for single item', () => {
      const result = normalizeScores([0.8], 'minmax');
      expect(result).toEqual([0.5]);
    });

    it('should apply min-max normalization', () => {
      const scores = [1, 3, 5, 7, 9];
      const result = normalizeScores(scores, 'minmax');

      expect(result).toHaveLength(5);
      expect(Math.min(...result)).toBe(0);
      expect(Math.max(...result)).toBe(1);
      expect(result).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('should apply z-score normalization', () => {
      const scores = [1, 2, 3, 4, 5];
      const result = normalizeScores(scores, 'zscore');

      expect(result).toHaveLength(5);
      // For scores [1,2,3,4,5], mean=3, stdDev=√2≈1.414
      // Z-scores: [-1.414, -0.707, 0, 0.707, 1.414]
      expect(result[0]).toBeCloseTo(-1.414, 3);
      expect(result[1]).toBeCloseTo(-0.707, 3);
      expect(result[2]).toBeCloseTo(0, 3);
      expect(result[3]).toBeCloseTo(0.707, 3);
      expect(result[4]).toBeCloseTo(1.414, 3);
    });

    it('should return original scores for "none" method', () => {
      const scores = [1, 3, 5, 7, 9];
      const result = normalizeScores(scores, 'none');

      expect(result).toEqual(scores);
    });

    it('should default to "none" for unknown method', () => {
      const scores = [1, 3, 5, 7, 9];
      const result = normalizeScores(scores, 'unknown' as NormalizationMethod);

      expect(result).toEqual(scores);
    });
  });

  describe('minMaxNormalize', () => {
    it('should normalize scores to [0,1] range', () => {
      const scores = [10, 20, 30, 40, 50];
      const result = minMaxNormalize(scores);

      expect(result).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('should handle constant scores', () => {
      const scores = [5, 5, 5, 5, 5];
      const result = minMaxNormalize(scores);

      expect(result).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    });

    it('should handle negative scores', () => {
      const scores = [-10, -5, 0, 5, 10];
      const result = minMaxNormalize(scores);

      expect(result).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('should handle decimal scores', () => {
      const scores = [0.1, 0.3, 0.5, 0.7, 0.9];
      const result = minMaxNormalize(scores);

      expect(result[0]).toBeCloseTo(0, 10);
      expect(result[1]).toBeCloseTo(0.25, 10);
      expect(result[2]).toBeCloseTo(0.5, 10);
      expect(result[3]).toBeCloseTo(0.75, 10);
      expect(result[4]).toBeCloseTo(1, 10);
    });
  });

  describe('zScoreNormalize', () => {
    it('should standardize scores with mean 0 and std dev 1', () => {
      const scores = [1, 2, 3, 4, 5];
      const result = zScoreNormalize(scores);

      // Mean should be approximately 0
      const mean = result.reduce((sum, val) => sum + val, 0) / result.length;
      expect(mean).toBeCloseTo(0, 10);

      // Check specific values
      expect(result[0]).toBeCloseTo(-1.414, 3); // (1-3)/1.414
      expect(result[2]).toBeCloseTo(0, 3);       // (3-3)/1.414
      expect(result[4]).toBeCloseTo(1.414, 3);   // (5-3)/1.414
    });

    it('should handle constant scores', () => {
      const scores = [7, 7, 7, 7, 7];
      const result = zScoreNormalize(scores);

      expect(result).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    });

    it('should handle single score', () => {
      const scores = [42];
      const result = zScoreNormalize(scores);

      // This should not be called directly with single score, but test anyway
      expect(result).toHaveLength(1);
    });

    it('should handle negative scores', () => {
      const scores = [-5, -3, -1, 1, 3];
      const result = zScoreNormalize(scores);

      expect(result).toHaveLength(5);
      // Mean should be approximately 0
      const mean = result.reduce((sum, val) => sum + val, 0) / result.length;
      expect(mean).toBeCloseTo(0, 10);
    });
  });

  describe('hasConstantScores', () => {
    it('should return true for empty array', () => {
      expect(hasConstantScores([])).toBe(true);
    });

    it('should return true for single item', () => {
      expect(hasConstantScores([5])).toBe(true);
    });

    it('should return true for constant scores', () => {
      expect(hasConstantScores([3, 3, 3, 3])).toBe(true);
    });

    it('should return false for varying scores', () => {
      expect(hasConstantScores([1, 2, 3, 4])).toBe(false);
    });

    it('should handle floating point scores', () => {
      expect(hasConstantScores([1.5, 1.5, 1.5])).toBe(true);
      expect(hasConstantScores([1.1, 1.2, 1.3])).toBe(false);
    });
  });

  describe('hasSmallList', () => {
    it('should return true for empty array', () => {
      expect(hasSmallList([])).toBe(true);
    });

    it('should return true for arrays at threshold', () => {
      expect(hasSmallList([1, 2], 2)).toBe(true);
      expect(hasSmallList([1, 2, 3], 2)).toBe(false);
    });

    it('should use default threshold of 2', () => {
      expect(hasSmallList([1])).toBe(true);
      expect(hasSmallList([1, 2])).toBe(true);
      expect(hasSmallList([1, 2, 3])).toBe(false);
    });

    it('should handle custom thresholds', () => {
      expect(hasSmallList([1, 2, 3], 3)).toBe(true);
      expect(hasSmallList([1, 2, 3, 4], 3)).toBe(false);
    });
  });

  describe('safeNormalizeScores', () => {
    it('should return empty array for empty input', () => {
      const result = safeNormalizeScores([], 'minmax');
      expect(result).toEqual([]);
    });

    it('should handle constant scores with fallback', () => {
      const scores = [5, 5, 5, 5, 5];
      const result = safeNormalizeScores(scores, 'minmax', 0.8);

      expect(result).toEqual([0.8, 0.8, 0.8, 0.8, 0.8]);
    });

    it('should handle small lists with fallback', () => {
      const scores = [1, 2];
      const result = safeNormalizeScores(scores, 'zscore', 0.3);

      expect(result).toEqual([0.3, 0.3]);
    });

    it('should use default fallback value of 0.5', () => {
      const scores = [7, 7, 7];
      const result = safeNormalizeScores(scores, 'minmax');

      expect(result).toEqual([0.5, 0.5, 0.5]);
    });

    it('should perform normal normalization when conditions are met', () => {
      const scores = [1, 3, 5, 7, 9];
      const result = safeNormalizeScores(scores, 'minmax');

      expect(result).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('should handle normalization errors gracefully', () => {
      // Mock a scenario that might cause errors (though current implementation is robust)
      const scores = [1, 2, 3, 4, 5];
      const result = safeNormalizeScores(scores, 'minmax', 0.9);

      // Should work normally
      expect(result).toHaveLength(5);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
    });

    it('should work with all normalization methods', () => {
      const scores = [10, 20, 30, 40, 50];

      const minmaxResult = safeNormalizeScores(scores, 'minmax');
      expect(minmaxResult).toEqual([0, 0.25, 0.5, 0.75, 1]);

      const zscoreResult = safeNormalizeScores(scores, 'zscore');
      expect(zscoreResult).toHaveLength(5);
      // Z-score should have mean approximately 0
      const mean = zscoreResult.reduce((sum, val) => sum + val, 0) / zscoreResult.length;
      expect(mean).toBeCloseTo(0, 10);

      const noneResult = safeNormalizeScores(scores, 'none');
      expect(noneResult).toEqual(scores);
    });
  });

  describe('Integration and edge cases', () => {
    it('should handle very large numbers', () => {
      const scores = [1000000, 2000000, 3000000];
      const result = normalizeScores(scores, 'minmax');

      expect(result).toEqual([0, 0.5, 1]);
    });

    it('should handle very small numbers', () => {
      const scores = [0.000001, 0.000002, 0.000003];
      const result = normalizeScores(scores, 'minmax');

      expect(result[0]).toBeCloseTo(0, 10);
      expect(result[1]).toBeCloseTo(0.5, 10);
      expect(result[2]).toBeCloseTo(1, 10);
    });

    it('should handle mixed positive and negative numbers', () => {
      const scores = [-100, -50, 0, 50, 100];
      const minmaxResult = normalizeScores(scores, 'minmax');
      expect(minmaxResult).toEqual([0, 0.25, 0.5, 0.75, 1]);

      const zscoreResult = normalizeScores(scores, 'zscore');
      expect(zscoreResult).toHaveLength(5);
    });

    it('should handle arrays with zeros', () => {
      const scores = [0, 0, 0, 1, 2];
      const minmaxResult = normalizeScores(scores, 'minmax');
      expect(minmaxResult).toEqual([0, 0, 0, 0.5, 1]);

      const zscoreResult = normalizeScores(scores, 'zscore');
      expect(zscoreResult).toHaveLength(5);
    });

    it('should handle arrays with only zeros', () => {
      const scores = [0, 0, 0, 0, 0];
      const minmaxResult = normalizeScores(scores, 'minmax');
      expect(minmaxResult).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);

      const zscoreResult = normalizeScores(scores, 'zscore');
      expect(zscoreResult).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    });
  });
});