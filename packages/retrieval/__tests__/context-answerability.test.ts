/**
 * Unit tests for answerability scorer
 */

import { AnswerabilityScorer, createAnswerabilityScorer } from '../src/context/answerability.js';

describe('AnswerabilityScorer', () => {
  let scorer: AnswerabilityScorer;

  beforeEach(() => {
    scorer = createAnswerabilityScorer(0.1);
  });

  describe('Answerability Scoring', () => {
    it('should score chunks with measurements highly', () => {
      const chunk = {
        id: '1',
        content: 'A day in Isharoth lasts approximately 26 hours.',
        score: 0.8,
        payload: {}
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBe(0.4); // "26 hours" (0.3) + "Isharoth" proper noun (0.1) = 0.4
    });

    it('should score definition chunks highly', () => {
      const chunk = {
        id: '2',
        content: 'Machine learning is defined as a subset of artificial intelligence.',
        score: 0.7,
        payload: {}
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBeGreaterThan(0.2); // Should detect "defined as"
    });

    it('should score date/time chunks moderately', () => {
      const chunk = {
        id: '3',
        content: 'The event occurred on January 15, 2024 at 3:30 PM.',
        score: 0.6,
        payload: {}
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBeGreaterThan(0.1); // Should detect date/time
    });

    it('should score list chunks moderately', () => {
      const chunk = {
        id: '4',
        content: '- First item\n- Second item\n- Third item',
        score: 0.5,
        payload: {}
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBeGreaterThan(0.1); // Should detect list format
    });

    it('should score header chunks higher', () => {
      const chunk = {
        id: '5',
        content: 'Basic information about the system.',
        score: 0.9,
        payload: { header: 'System Overview' }
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBeGreaterThan(0.15); // Header bonus
    });

    it('should cap scores at 1.0', () => {
      const chunk = {
        id: '6',
        content: 'This chunk has 42 days, is defined as perfect, contains January 1, 2024, and has items: - one - two - three. What is this?',
        score: 0.8,
        payload: { header: 'Perfect Example' }
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should score empty chunks as 0', () => {
      const chunk = {
        id: '7',
        content: '',
        score: 0.1,
        payload: {}
      };

      const score = scorer.scoreAnswerability(chunk);
      expect(score).toBe(0);
    });
  });

  describe('Bonus Application', () => {
    it('should apply answerability bonus to final score', () => {
      const chunk = {
        id: '1',
        content: 'A day lasts 26 hours.',
        score: 0.8,
        payload: {}
      };

      const finalScore = scorer.applyBonus(chunk, 0.8);
      expect(finalScore).toBeGreaterThan(0.8); // Should be boosted
    });

    it('should apply bonus to low answerability chunks', () => {
      const chunk = {
        id: '2',
        content: 'This is just some random text without any answerable content.',
        score: 0.6,
        payload: {}
      };

      const finalScore = scorer.applyBonus(chunk, 0.6);
      expect(finalScore).toBeGreaterThan(0.6); // Always applies some bonus
    });
  });

  describe('Answer Detection', () => {
    it('should detect likely answer chunks for measurement queries', () => {
      const chunk = {
        id: '1',
        content: 'The duration is exactly 26 hours.',
        score: 0.8,
        payload: {}
      };

      const isAnswer = scorer.likelyContainsAnswer(chunk, 'How long is the duration?');
      expect(isAnswer).toBe(true);
    });

    it('should detect likely answer chunks for definition queries', () => {
      const chunk = {
        id: '2',
        content: 'Machine learning is defined as...',
        score: 0.7,
        payload: {}
      };

      const isAnswer = scorer.likelyContainsAnswer(chunk, 'What is machine learning?');
      expect(isAnswer).toBe(true);
    });

    it('should reject chunks without query terms', () => {
      const chunk = {
        id: '3',
        content: 'This talks about cats and dogs.',
        score: 0.5,
        payload: {}
      };

      const isAnswer = scorer.likelyContainsAnswer(chunk, 'How long is a day?');
      expect(isAnswer).toBe(false);
    });

    it('should handle short queries', () => {
      const chunk = {
        id: '4',
        content: 'The answer is 42.',
        score: 0.9,
        payload: {}
      };

      const isAnswer = scorer.likelyContainsAnswer(chunk, 'What?');
      expect(isAnswer).toBe(false); // Query too short
    });
  });

  describe('Configuration', () => {
    it('should update bonus weight', () => {
      scorer.setBonus(0.2);
      const chunk = {
        id: '1',
        content: 'A day lasts 26 hours.',
        score: 0.8,
        payload: {}
      };

      const finalScore = scorer.applyBonus(chunk, 0.8);
      expect(finalScore).toBeGreaterThan(0.8);
    });

    it('should clamp bonus to reasonable bounds', () => {
      scorer.setBonus(1.0); // Too high
      expect(() => scorer.setBonus(1.0)).not.toThrow();

      scorer.setBonus(-0.1); // Negative
      expect(() => scorer.setBonus(-0.1)).not.toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create scorer with default bonus', () => {
      const scorer = createAnswerabilityScorer();
      expect(scorer).toBeInstanceOf(AnswerabilityScorer);
    });

    it('should create scorer with custom bonus', () => {
      const scorer = createAnswerabilityScorer(0.2);
      expect(scorer).toBeInstanceOf(AnswerabilityScorer);
    });
  });
});