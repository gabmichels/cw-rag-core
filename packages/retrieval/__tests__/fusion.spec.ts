import { fuse, FusionConfig, FusionStrategyName, FusionInput } from '../src/services/fusion.js';
import { minMaxNormalize, zScoreNormalize, safeNormalizeScores } from '../src/services/score-normalize.js';

describe('Fusion System', () => {
  describe('weighted_average strategy', () => {
    it('should preserve semantic confidence with weighted average', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.75, rank: 1 },
        { id: 'doc2', score: 0.35, rank: 2 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.60, rank: 1 },
        { id: 'doc2', score: 0.40, rank: 2 }
      ];

      const config: FusionConfig = {
        strategy: "weighted_average",
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const results = fuse(vector, keyword, config);

      // Top candidate should have higher fused score than both normalized means
      expect(results[0].fusedScore).toBeGreaterThan(0.5); // Higher than average
      expect(results[0].components.vector).toBeDefined();
      expect(results[0].components.keyword).toBeDefined();
    });

    it('should handle missing keyword results', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.75, rank: 1 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [];

      const config: FusionConfig = {
        strategy: "weighted_average",
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const results = fuse(vector, keyword, config);

      expect(results[0].fusedScore).toBe(0.7 * 1.0); // Full vector weight
      expect(results[0].components.vector).toBe(1.0);
      expect(results[0].components.keyword).toBeUndefined();
    });
  });

  describe('score_weighted_rrf strategy', () => {
    it('should preserve score while adding rank smoothing', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.75, rank: 1 },
        { id: 'doc2', score: 0.35, rank: 2 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.60, rank: 1 },
        { id: 'doc2', score: 0.40, rank: 2 }
      ];

      const config: FusionConfig = {
        strategy: "score_weighted_rrf",
        kParam: 5,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const results = fuse(vector, keyword, config);

      // Should have both score and rank components
      expect(results[0].components.vector).toBeDefined();
      expect(results[0].components.keyword).toBeDefined();
      expect(results[0].components.rankBlend).toBeDefined();
    });

    it('should have higher fused score with k=5 vs k=60', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.75, rank: 18 } // Isharoth case
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.60, rank: 5 }
      ];

      const configK5: FusionConfig = {
        strategy: "score_weighted_rrf",
        kParam: 5,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const configK60: FusionConfig = {
        strategy: "score_weighted_rrf",
        kParam: 60,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const resultsK5 = fuse(vector, keyword, configK5);
      const resultsK60 = fuse(vector, keyword, configK60);

      expect(resultsK5[0].fusedScore).toBeGreaterThan(resultsK60[0].fusedScore);
    });
  });

  describe('max_confidence strategy', () => {
    it('should select maximum normalized score', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.80, rank: 1 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.60, rank: 1 }
      ];

      const config: FusionConfig = {
        strategy: "max_confidence",
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const results = fuse(vector, keyword, config);

      expect(results[0].fusedScore).toBe(1.0); // Max of normalized scores
      expect(results[0].components.vector).toBe(1.0);
      expect(results[0].components.keyword).toBe(1.0);
    });
  });

  describe('Isharoth case simulation', () => {
    it('should keep Isharoth in top-N with new fusion', () => {
      // Simulate Isharoth case: rank 18, score 0.617
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'isharoth', score: 0.617, rank: 18 },
        { id: 'other1', score: 0.80, rank: 1 },
        { id: 'other2', score: 0.75, rank: 2 },
        { id: 'other3', score: 0.70, rank: 3 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [
        { id: 'isharoth', score: 0.30, rank: 15 },
        { id: 'other1', score: 0.60, rank: 1 },
        { id: 'other2', score: 0.55, rank: 2 },
        { id: 'other3', score: 0.50, rank: 3 }
      ];

      const config: FusionConfig = {
        strategy: "weighted_average",
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      const results = fuse(vector, keyword, config);

      // Isharoth should be in top 10 (much better than old RRF)
      const isharothRank = results.findIndex((r: any) => r.id === 'isharoth');
      expect(isharothRank).toBeLessThan(10);
      expect(isharothRank).toBeGreaterThan(-1);
    });
  });

  describe('Normalization utilities', () => {
    describe('minMaxNormalize', () => {
      it('should normalize to [0,1] range', () => {
        const scores = [0.2, 0.5, 0.8];
        const normalized = minMaxNormalize(scores);
        expect(Math.min(...normalized)).toBe(0);
        expect(Math.max(...normalized)).toBe(1);
        expect(normalized).toEqual([0, 0.5, 1]);
      });

      it('should handle constant scores', () => {
        const scores = [0.5, 0.5, 0.5];
        const normalized = minMaxNormalize(scores);
        expect(normalized).toEqual([0.5, 0.5, 0.5]);
      });
    });

    describe('zScoreNormalize', () => {
      it('should apply z-score normalization', () => {
        const scores = [1, 2, 3]; // mean=2, std=1
        const normalized = zScoreNormalize(scores);
        expect(normalized[0]).toBeCloseTo(-1, 1); // (1-2)/1 = -1
        expect(normalized[1]).toBeCloseTo(0, 1);   // (2-2)/1 = 0
        expect(normalized[2]).toBeCloseTo(1, 1);   // (3-2)/1 = 1
      });
    });

    describe('safeNormalizeScores', () => {
      it('should handle edge cases gracefully', () => {
        const constantScores = [0.5, 0.5, 0.5];
        const result = safeNormalizeScores(constantScores, "minmax");
        expect(result).toEqual([0.5, 0.5, 0.5]);
      });

      it('should handle small lists', () => {
        const smallList = [0.8];
        const result = safeNormalizeScores(smallList, "minmax");
        expect(result).toEqual([0.5]);
      });
    });
  });

  describe('Strategy validation', () => {
    it('should throw error for unknown strategy', () => {
      const vector: Array<{ id: string; score: number; rank: number }> = [
        { id: 'doc1', score: 0.75, rank: 1 }
      ];

      const keyword: Array<{ id: string; score: number; rank: number }> = [];

      const config: FusionConfig = {
        strategy: "unknown" as any,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        normalization: "minmax"
      };

      expect(() => fuse(vector, keyword, config)).toThrow('Unknown fusion strategy');
    });
  });

  describe('Normalization functions', () => {
    it('should handle empty arrays in safeNormalizeScores', () => {
      const empty: number[] = [];
      const result = safeNormalizeScores(empty, "minmax");
      expect(result).toEqual([]);
    });

    it('should handle single item in safeNormalizeScores', () => {
      const single: number[] = [0.8];
      const result = safeNormalizeScores(single, "minmax");
      expect(result).toEqual([0.5]);
    });

    it('should apply minmax normalization correctly', () => {
      const scores: number[] = [0.2, 0.5, 0.8];
      const result = safeNormalizeScores(scores, "minmax");
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0.5);
      expect(result[2]).toBe(1);
    });

    it('should apply zscore normalization correctly', () => {
      const scores: number[] = [1, 2, 3];
      const result = safeNormalizeScores(scores, "zscore");
      expect(result[0]).toBeCloseTo(-1, 1);
      expect(result[1]).toBeCloseTo(0, 1);
      expect(result[2]).toBeCloseTo(1, 1);
    });
  });
});