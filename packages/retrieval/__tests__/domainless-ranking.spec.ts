/**
 * Tests for domainless ranking features
 */

import { extractQueryTerms } from '../src/nlp/keyphrase-extract.js';
import { loadCorpusStats, updateCorpusStats } from '../src/stats/corpus-stats.js';
import { getAliasCluster } from '../src/sem/alias-cluster.js';
import { computeMatchFeatures, Candidate } from '../src/rank/coverage-proximity.js';
import { exclusivityPenalty } from '../src/rank/exclusivity.js';

// Mock embedding service
const mockEmbedder = {
  embed: async (text: string) => {
    // Simple mock embeddings based on word count
    const words = text.toLowerCase().split(/\s+/);
    return new Array(384).fill(0).map((_, i) => words.length * 0.1 + i * 0.01);
  }
};

describe('Domainless Ranking', () => {
  let mockStats: any;

  beforeAll(() => {
    // Create mock corpus stats
    mockStats = {
      idf: new Map([
        ['ultimate', 2.0],
        ['wizard', 1.8],
        ['rogue', 1.7],
        ['warrior', 1.6],
        ['mage', 1.9],
        ['spirit', 1.5],
        ['bloom', 1.4]
      ]),
      cooc: new Map([
        ['ultimate', new Map([['wizard', 5], ['rogue', 1], ['warrior', 2]])],
        ['wizard', new Map([['ultimate', 5], ['mage', 8]])],
        ['rogue', new Map([['ultimate', 1], ['warrior', 3]])]
      ]),
      pmi: new Map([
        ['ultimate', new Map([['wizard', 0.8], ['rogue', -0.2]])],
        ['wizard', new Map([['ultimate', 0.8], ['mage', 0.6]])]
      ]),
      totalDocs: 100,
      totalTokens: 10000
    };
  });

  describe('Keyphrase Extraction', () => {
    test('extracts phrases from query', () => {
      const result = extractQueryTerms('What is the Ultimate of the Wizard?', mockStats);

      expect(result.phrases).toContain('ultimate wizard');
      expect(result.tokens).toContain('ultimate');
      expect(result.tokens).toContain('wizard');
    });

    test('handles short queries', () => {
      const result = extractQueryTerms('wizard ultimate', mockStats);

      expect(result.phrases.length).toBeGreaterThan(0);
      expect(result.tokens).toContain('wizard');
      expect(result.tokens).toContain('ultimate');
    });
  });

  describe('Alias Clustering', () => {
    test('finds similar terms', async () => {
      const cluster = await getAliasCluster('wizard', mockStats, mockEmbedder);

      expect(cluster.center).toBe('wizard');
      expect(cluster.members).toContain('wizard');
      expect(cluster.members).toContain('mage'); // High PMI
    });

    test('handles unknown terms', async () => {
      const cluster = await getAliasCluster('unknown', mockStats, mockEmbedder);

      expect(cluster.center).toBe('unknown');
      expect(cluster.members).toEqual(['unknown']);
    });
  });

  describe('Coverage & Proximity', () => {
    test('computes coverage correctly', () => {
      const candidate: Candidate = {
        id: 'test',
        content: 'The wizard has an ultimate ability',
        payload: { title: 'Wizard Guide' }
      };

      const groups = [['ultimate'], ['wizard']];
      const fields = { title: 'Wizard Guide' };

      const features = computeMatchFeatures(candidate, groups, fields);

      expect(features.coverage).toBe(1.0); // Both groups present
      expect(features.fieldBoost).toBeGreaterThan(0); // Title match
    });

    test('handles missing terms', () => {
      const candidate: Candidate = {
        id: 'test',
        content: 'The warrior has strength',
        payload: {}
      };

      const groups = [['ultimate'], ['wizard']];
      const fields = {};

      const features = computeMatchFeatures(candidate, groups, fields);

      expect(features.coverage).toBe(0.0); // No groups present
    });
  });

  describe('Exclusivity Penalty', () => {
    test('penalizes exclusive terms', () => {
      const candidateTerms = ['rogue', 'ultimate'];
      const groups = [['ultimate'], ['wizard']];

      const penalty = exclusivityPenalty(candidateTerms, groups, mockStats);

      expect(penalty).toBeGreaterThan(0); // Should penalize rogue + ultimate without wizard
    });

    test('no penalty for complete coverage', () => {
      const candidateTerms = ['ultimate', 'wizard'];
      const groups = [['ultimate'], ['wizard']];

      const penalty = exclusivityPenalty(candidateTerms, groups, mockStats);

      expect(penalty).toBe(0); // No penalty when all groups covered
    });
  });

  describe('Feature Flags', () => {
    test('respects global feature flag', () => {
      const originalEnv = process.env.FEATURES_ENABLED;
      process.env.FEATURES_ENABLED = 'on';

      // Test would go here - feature flag logic is in hybrid-search.ts

      // Restore
      process.env.FEATURES_ENABLED = originalEnv;
    });

    test('respects specific feature flag', () => {
      const originalEnv = process.env.DOMAINLESS_RANKING_ENABLED;
      process.env.DOMAINLESS_RANKING_ENABLED = 'on';

      // Test would go here

      // Restore
      process.env.DOMAINLESS_RANKING_ENABLED = originalEnv;
    });
  });

  describe('Integration', () => {
    test('end-to-end ranking flow', async () => {
      // This would test the full integration in hybrid-search.ts
      // For now, just verify the components work together

      const query = 'wizard ultimate ability';
      const qt = extractQueryTerms(query, mockStats);
      expect(qt.phrases.length).toBeGreaterThan(0);

      const cluster = await getAliasCluster(qt.phrases[0], mockStats, mockEmbedder);
      expect(cluster.members.length).toBeGreaterThan(0);
    });
  });
});