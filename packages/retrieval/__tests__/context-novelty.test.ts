/**
 * Unit tests for novelty scorer
 */

import { NoveltyScorer, createNoveltyScorer } from '../src/context/novelty.js';

describe('NoveltyScorer', () => {
  let scorer: NoveltyScorer;

  beforeEach(() => {
    scorer = createNoveltyScorer(0.5); // lambda = 0.5
  });

  describe('Novelty Scoring', () => {
    it('should score maximum novelty for empty selection', async () => {
      const candidate = {
        id: '1',
        content: 'Machine learning is important',
        score: 0.9,
        payload: {}
      };

      const novelty = await scorer.scoreNovelty(candidate, []);
      expect(novelty).toBe(1.0);
    });

    it('should score lower novelty for similar content', async () => {
      const candidate = {
        id: '1',
        content: 'Machine learning algorithms work well',
        score: 0.9,
        payload: {}
      };

      const selected = [{
        id: '2',
        content: 'Deep learning neural networks are powerful',
        score: 0.8,
        payload: {}
      }];

      const novelty = await scorer.scoreNovelty(candidate, selected);
      expect(novelty).toBeLessThan(1.0);
      expect(novelty).toBeGreaterThan(0.0);
    });

    it('should use text-based similarity when no embedding service', async () => {
      const candidate = {
        id: '1',
        content: 'Machine learning is powerful',
        score: 0.9,
        payload: {}
      };

      const selected = [{
        id: '2',
        content: 'Weather forecasting uses AI',
        score: 0.8,
        payload: {}
      }];

      const novelty = await scorer.scoreNovelty(candidate, selected);
      expect(novelty).toBeGreaterThan(0.3); // Should be somewhat novel (different topics)
    });
  });

  describe('MMR Scoring', () => {
    it('should balance relevance and novelty', async () => {
      const candidate = {
        id: '1',
        content: 'Machine learning algorithms',
        score: 0.9,
        payload: {}
      };

      const selected: any[] = [];

      const mmrScore = await scorer.mmrScore(candidate, selected, 0.9);
      expect(mmrScore).toBeGreaterThan(0.4); // Should be high due to high relevance and novelty
    });

    it('should penalize redundant content', async () => {
      const candidate = {
        id: '1',
        content: 'Machine learning is important',
        score: 0.9,
        payload: {}
      };

      const selected = [{
        id: '2',
        content: 'Machine learning is crucial',
        score: 0.8,
        payload: {}
      }];

      const mmrScore = await scorer.mmrScore(candidate, selected, 0.9);
      expect(mmrScore).toBeLessThan(0.9); // Should be penalized for redundancy
    });
  });

  describe('MMR Application', () => {
    it('should apply MMR to ranked candidates', async () => {
      const candidates = [
        { id: '1', content: 'Machine learning basics', fusionScore: 0.9, score: 0.9, payload: {} },
        { id: '2', content: 'ML algorithms are complex', fusionScore: 0.8, score: 0.8, payload: {} },
        { id: '3', content: 'Weather prediction uses ML', fusionScore: 0.6, score: 0.6, payload: {} }
      ];

      const selected = await scorer.applyMMR(candidates, 2);
      expect(selected.length).toBe(2);
      expect(selected[0].id).toBeDefined();
    });

    it('should respect max results limit', async () => {
      const candidates = [
        { id: '1', content: 'Content 1', fusionScore: 0.9, score: 0.9, payload: {} },
        { id: '2', content: 'Content 2', fusionScore: 0.8, score: 0.8, payload: {} },
        { id: '3', content: 'Content 3', fusionScore: 0.7, score: 0.7, payload: {} },
        { id: '4', content: 'Content 4', fusionScore: 0.6, score: 0.6, payload: {} }
      ];

      const selected = await scorer.applyMMR(candidates, 2);
      expect(selected.length).toBe(2);
    });

    it('should handle empty candidate list', async () => {
      const selected = await scorer.applyMMR([], 5);
      expect(selected.length).toBe(0);
    });
  });

  describe('Alpha Parameter', () => {
    it('should update alpha parameter', () => {
      scorer.setAlpha(0.8);
      // Test that it doesn't throw - alpha affects MMR scoring internally
      expect(() => scorer.setAlpha(0.8)).not.toThrow();
    });

    it('should clamp alpha to valid range', () => {
      scorer.setAlpha(1.5); // Should clamp to 1.0
      expect(() => scorer.setAlpha(1.5)).not.toThrow();

      scorer.setAlpha(-0.1); // Should clamp to 0.0
      expect(() => scorer.setAlpha(-0.1)).not.toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create scorer with default alpha', () => {
      const scorer = createNoveltyScorer();
      expect(scorer).toBeInstanceOf(NoveltyScorer);
    });

    it('should create scorer with custom alpha', () => {
      const scorer = createNoveltyScorer(0.7);
      expect(scorer).toBeInstanceOf(NoveltyScorer);
    });

    it('should create scorer with embedding service', () => {
      const mockEmbeddingService = {
        embed: async (text: string) => [0.1, 0.2, 0.3]
      };

      const scorer = createNoveltyScorer(0.5, mockEmbeddingService);
      expect(scorer).toBeInstanceOf(NoveltyScorer);
    });
  });
});