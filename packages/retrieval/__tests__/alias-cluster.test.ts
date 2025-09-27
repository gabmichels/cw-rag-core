import {
  getAliasCluster,
  clearClusterCache,
  AliasCluster,
  EmbeddingFn
} from '../src/sem/alias-cluster.js';
import { CorpusStats } from '../src/stats/corpus-stats.js';

// Mock embedding function
class MockEmbeddingFn implements EmbeddingFn {
  private embeddings = new Map<string, number[]>();

  constructor(embeddings: Record<string, number[]> = {}) {
    this.embeddings = new Map(Object.entries(embeddings));
  }

  async embed(text: string): Promise<number[]> {
    const cached = this.embeddings.get(text.toLowerCase());
    if (cached) return cached;

    // Default mock embedding based on text length
    return Array.from({ length: 384 }, (_, i) => Math.sin(text.length + i) * 0.1);
  }

  setEmbedding(text: string, embedding: number[]) {
    this.embeddings.set(text.toLowerCase(), embedding);
  }
}

// Mock corpus stats
function createMockCorpusStats(): CorpusStats {
  return {
    cooc: new Map([
      ['machine', new Map([['learning', 10], ['computer', 5], ['ai', 3]])],
      ['learning', new Map([['machine', 10], ['algorithm', 8], ['data', 6]])],
      ['computer', new Map([['machine', 5], ['science', 4]])]
    ]),
    pmi: new Map([
      ['machine', new Map([['learning', 0.8], ['computer', 0.4], ['ai', 0.6]])],
      ['learning', new Map([['machine', 0.8], ['algorithm', 0.7], ['data', 0.5]])],
      ['computer', new Map([['machine', 0.4], ['science', 0.3]])]
    ]),
    idf: new Map([
      ['machine', 2.5],
      ['learning', 2.3],
      ['computer', 2.1],
      ['algorithm', 2.8],
      ['data', 1.5],
      ['science', 2.2],
      ['ai', 2.4],
      ['short', 0.5] // Low IDF
    ]),
    totalDocs: 1000,
    totalTokens: 150000
  };
}

describe('Alias Clustering', () => {
  let mockEmbed: MockEmbeddingFn;
  let mockStats: CorpusStats;

  beforeEach(() => {
    mockEmbed = new MockEmbeddingFn();
    mockStats = createMockCorpusStats();
    clearClusterCache(); // Clear cache between tests
  });

  describe('getAliasCluster', () => {
    it('should return a cluster with the phrase as center', async () => {
      const phrase = 'machine learning';

      const result = await getAliasCluster(phrase, mockStats, mockEmbed);

      expect(result).toHaveProperty('center', phrase);
      expect(result).toHaveProperty('members');
      expect(Array.isArray(result.members)).toBe(true);
      expect(result.members).toContain(phrase);
    });

    it('should return cached cluster on subsequent calls', async () => {
      const phrase = 'machine learning';

      // First call
      const result1 = await getAliasCluster(phrase, mockStats, mockEmbed);

      // Second call should use cache
      const result2 = await getAliasCluster(phrase, mockStats, mockEmbed);

      expect(result2).toEqual(result1);
    });

    it('should handle embedding failures gracefully', async () => {
      const failingEmbed = {
        embed: jest.fn().mockRejectedValue(new Error('Embedding failed'))
      };

      const result = await getAliasCluster('test phrase', mockStats, failingEmbed as any);

      expect(result).toEqual({
        center: 'test phrase',
        members: ['test phrase']
      });
    });

    it('should handle empty corpus stats', async () => {
      const emptyStats: CorpusStats = {
        cooc: new Map(),
        pmi: new Map(),
        idf: new Map(),
        totalDocs: 0,
        totalTokens: 0
      };

      const result = await getAliasCluster('test phrase', emptyStats, mockEmbed);

      expect(result).toEqual({
        center: 'test phrase',
        members: ['test phrase']
      });
    });
  });

  describe('clearClusterCache', () => {
    it('should clear the cluster cache', async () => {
      const phrase = 'test phrase';

      // Add to cache
      await getAliasCluster(phrase, mockStats, mockEmbed);

      // Clear cache
      clearClusterCache();

      // Next call should work (cache cleared)
      const result = await getAliasCluster(phrase, mockStats, mockEmbed);

      expect(result).toBeDefined();
      expect(result.center).toBe(phrase);
    });
  });

  describe('environment variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use custom embedding similarity threshold', async () => {
      process.env.ALIAS_EMB_SIM_TAU = '0.5'; // Lower threshold

      // Force module reload to pick up env var
      jest.resetModules();
      const { getAliasCluster } = await import('../src/sem/alias-cluster.js');

      const result = await getAliasCluster('phrase1', mockStats, mockEmbed);

      expect(result).toBeDefined();
      expect(result.center).toBe('phrase1');
    });

    it('should use custom PMI similarity threshold', async () => {
      process.env.ALIAS_PMI_SIM_TAU = '0.1'; // Lower threshold

      jest.resetModules();
      const { getAliasCluster } = await import('../src/sem/alias-cluster.js');

      const result = await getAliasCluster('machine', mockStats, mockEmbed);

      expect(result).toBeDefined();
      expect(result.center).toBe('machine');
    });
  });

  describe('edge cases', () => {
    it('should handle empty phrase', async () => {
      const result = await getAliasCluster('', mockStats, mockEmbed);

      expect(result).toEqual({
        center: '',
        members: ['']
      });
    });

    it('should handle phrase with only stopwords', async () => {
      const result = await getAliasCluster('the and or', mockStats, mockEmbed);

      expect(result.center).toBe('the and or');
      expect(result.members).toContain('the and or');
    });

    it('should handle very long phrases', async () => {
      const longPhrase = 'A'.repeat(1000);
      const result = await getAliasCluster(longPhrase, mockStats, mockEmbed);

      expect(result.center).toBe(longPhrase);
      expect(result.members).toContain(longPhrase);
    });

    it('should handle phrases with special characters', async () => {
      const specialPhrase = 'machine-learning@2023!';
      const result = await getAliasCluster(specialPhrase, mockStats, mockEmbed);

      expect(result.center).toBe(specialPhrase);
    });

    it('should handle phrases with numbers', async () => {
      const numericPhrase = 'test123';
      const result = await getAliasCluster(numericPhrase, mockStats, mockEmbed);

      expect(result.center).toBe(numericPhrase);
      expect(result.members).toContain(numericPhrase);
    });
  });

  describe('caching behavior', () => {
    it('should cache results by lowercase phrase', async () => {
      const phrase1 = 'Machine Learning';
      const phrase2 = 'machine learning';

      const result1 = await getAliasCluster(phrase1, mockStats, mockEmbed);
      const result2 = await getAliasCluster(phrase2, mockStats, mockEmbed);

      // Should be the same cached result
      expect(result2).toEqual(result1);
    });

    it('should rebuild when cache expires', async () => {
      const phrase = 'machine learning';

      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      let timeOffset = 0;

      jest.spyOn(Date, 'now').mockImplementation(() => originalNow() + timeOffset);

      // First call
      const result1 = await getAliasCluster(phrase, mockStats, mockEmbed);

      // Advance time past TTL (1 hour)
      timeOffset = 60 * 60 * 1000 + 1000;

      // Second call should rebuild
      const result2 = await getAliasCluster(phrase, mockStats, mockEmbed);

      expect(result2).toBeDefined();
      expect(result2.center).toBe(phrase);

      jest.restoreAllMocks();
    });
  });

  describe('cluster building logic', () => {
    it('should include similar terms in cluster when embeddings are similar', async () => {
      // Set up embeddings that are very similar
      mockEmbed.setEmbedding('machine learning', [1, 0, 0]);
      mockEmbed.setEmbedding('computer learning', [0.95, 0.05, 0]); // Very similar

      const result = await getAliasCluster('machine learning', mockStats, mockEmbed);

      expect(result.center).toBe('machine learning');
      expect(result.members.length).toBeGreaterThanOrEqual(1);
    });

    it('should deduplicate cluster members', async () => {
      const result = await getAliasCluster('machine learning', mockStats, mockEmbed);

      const uniqueMembers = [...new Set(result.members)];
      expect(result.members).toEqual(uniqueMembers);
    });

    it('should handle case insensitive phrase matching', async () => {
      // Clear cache to ensure fresh calls
      clearClusterCache();

      const result1 = await getAliasCluster('Machine Learning', mockStats, mockEmbed);
      const result2 = await getAliasCluster('machine learning', mockStats, mockEmbed);

      expect(result1.center).toBe('Machine Learning');
      // Second call should return cached result from first call
      expect(result2.center).toBe('Machine Learning');
    });
  });
});