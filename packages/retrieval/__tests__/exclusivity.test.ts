import { exclusivityPenalty } from '../src/rank/exclusivity.js';
import { CorpusStats } from '../src/stats/corpus-stats.js';

// Mock CorpusStats
const mockCorpusStats: CorpusStats = {
  idf: new Map([
    ['machine', 3.0], // High IDF
    ['learning', 2.5], // High IDF
    ['neural', 4.0], // Very high IDF
    ['network', 3.5], // High IDF
    ['algorithm', 2.8], // High IDF
    ['data', 1.5], // Low IDF
    ['the', 0.5] // Very low IDF
  ]),
  pmi: new Map([
    ['machine', new Map([
      ['learning', 0.8],
      ['neural', 0.05], // Low PMI - exclusive
      ['network', 0.02], // Low PMI - exclusive
      ['data', 0.3]
    ])],
    ['learning', new Map([
      ['machine', 0.8],
      ['neural', 0.15], // Medium PMI
      ['network', 0.08], // Low PMI
      ['data', 0.4]
    ])],
    ['neural', new Map([
      ['machine', 0.05], // Low PMI - exclusive
      ['learning', 0.15],
      ['network', 0.9], // High PMI - not exclusive
      ['data', 0.01]
    ])],
    ['network', new Map([
      ['machine', 0.02], // Low PMI - exclusive
      ['learning', 0.08],
      ['neural', 0.9], // High PMI - not exclusive
      ['data', 0.05]
    ])]
  ]),
  cooc: new Map([
    ['machine', new Map([
      ['learning', 15],
      ['neural', 1], // Low co-occurrence
      ['network', 0], // No co-occurrence
      ['data', 8]
    ])],
    ['learning', new Map([
      ['machine', 15],
      ['neural', 3],
      ['network', 1],
      ['data', 12]
    ])],
    ['neural', new Map([
      ['machine', 1],
      ['learning', 3],
      ['network', 20], // High co-occurrence
      ['data', 0]
    ])],
    ['network', new Map([
      ['machine', 0],
      ['learning', 1],
      ['neural', 20], // High co-occurrence
      ['data', 2]
    ])]
  ]),
  totalDocs: 1000,
  totalTokens: 150000
};

describe('Exclusivity Penalty', () => {
  describe('exclusivityPenalty', () => {
    it('should return 0 for less than 2 groups', () => {
      const result = exclusivityPenalty(['machine'], [[]], mockCorpusStats);
      expect(result).toBe(0.0);

      const result2 = exclusivityPenalty(['machine'], [], mockCorpusStats);
      expect(result2).toBe(0.0);
    });

    it('should return 0 when no exclusivity penalty applies', () => {
      // Groups that don't have exclusive terms
      const groups = [['data'], ['the']]; // Low IDF terms
      const candidateTerms = ['data'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBe(0.0);
    });

    it('should calculate penalty when exclusive terms are present', () => {
      // neural and network are exclusive to machine/learning group
      const groups = [['machine', 'learning'], ['neural', 'network']];
      const candidateTerms = ['machine']; // Has machine (group1) but not neural/network (group2)

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBeGreaterThan(0);
    });

    it('should average penalties across multiple pairs', () => {
      const groups = [
        ['machine', 'learning'],
        ['neural'],
        ['network']
      ];
      const candidateTerms = ['machine', 'neural', 'network'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('should handle empty candidate terms', () => {
      const groups = [['machine'], ['neural']];
      const result = exclusivityPenalty([], groups, mockCorpusStats);
      expect(result).toBe(0.0);
    });

    it('should handle case insensitive term matching', () => {
      const groups = [['Machine'], ['Neural']];
      const candidateTerms = ['machine', 'NEURAL'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle groups with duplicate terms', () => {
      const groups = [['machine', 'machine'], ['neural']];
      const candidateTerms = ['machine'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('constants and thresholds', () => {
    it('should use correct exclusivity threshold', () => {
      // Test that the threshold constant is used correctly
      const groups = [['machine'], ['neural']];
      const candidateTerms = ['machine'];

      // neural has PMI 0.05 with machine, which is below threshold
      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBe(1.0); // Should get penalty since neural is exclusive
    });

    it('should use correct high IDF threshold', () => {
      // Test with a term that has IDF below threshold
      const lowIdfStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map([
          ['lowidf', 1.5], // Below HIGH_IDF_THRESHOLD (2.0)
          ['highidf', 2.5] // Above threshold
        ]),
        pmi: new Map([
          ['lowidf', new Map([['other', 0.05]])],
          ['highidf', new Map([['other', 0.05]])]
        ]),
        cooc: new Map([
          ['lowidf', new Map([['other', 0]])],
          ['highidf', new Map([['other', 0]])]
        ])
      };

      const groups = [['lowidf'], ['highidf']];
      const candidateTerms = ['lowidf'];

      const result = exclusivityPenalty(candidateTerms, groups, lowIdfStats);
      // Should not get penalty for lowidf term since it's below IDF threshold
      expect(result).toBe(0.0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing IDF values', () => {
      const incompleteStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map() // Empty IDF map
      };

      const groups = [['unknown'], ['other']];
      const candidateTerms = ['unknown'];

      const result = exclusivityPenalty(candidateTerms, groups, incompleteStats);
      expect(result).toBe(0.0);
    });

    it('should handle missing PMI values', () => {
      const incompleteStats: CorpusStats = {
        ...mockCorpusStats,
        pmi: new Map() // Empty PMI map - lookups return 0
      };

      const groups = [['machine'], ['neural']];
      const candidateTerms = ['machine'];

      const result = exclusivityPenalty(candidateTerms, groups, incompleteStats);
      expect(result).toBe(1.0); // Should get penalty since PMI defaults to 0 (exclusive)
    });

    it('should handle missing co-occurrence values', () => {
      const incompleteStats: CorpusStats = {
        ...mockCorpusStats,
        cooc: new Map() // Empty co-occurrence map - lookups return 0
      };

      const groups = [['machine'], ['neural']];
      const candidateTerms = ['machine'];

      const result = exclusivityPenalty(candidateTerms, groups, incompleteStats);
      expect(result).toBe(1.0); // Should get penalty since cooc defaults to 0 (exclusive)
    });

    it('should handle terms not in candidate set', () => {
      const groups = [['machine'], ['neural']];
      const candidateTerms = ['algorithm']; // Not in any group

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBe(0.0);
    });

    it('should handle groups with no high-IDF terms', () => {
      const groups = [['data'], ['the']]; // All low IDF
      const candidateTerms = ['data'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(result).toBe(0.0);
    });

    it('should handle very large number of groups', () => {
      const groups = Array.from({ length: 10 }, (_, i) => [`term${i}`]);
      const candidateTerms = ['term0'];

      const result = exclusivityPenalty(candidateTerms, groups, mockCorpusStats);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('internal logic validation', () => {
    it('should properly use PMI thresholds for exclusivity', () => {
      // Test that terms with PMI above threshold are not considered exclusive
      const highPmiStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map([
          ['term1', 3.0],
          ['term2', 3.0]
        ]),
        pmi: new Map([
          ['term1', new Map([['term2', 0.5]])], // Above EXCLUSIVITY_THRESHOLD (0.1)
          ['term2', new Map([['term1', 0.5]])]
        ]),
        cooc: new Map([
          ['term1', new Map([['term2', 1]])],
          ['term2', new Map([['term1', 1]])]
        ]),
        totalDocs: 100,
        totalTokens: 1000
      };

      const groups = [['term1'], ['term2']];
      const candidateTerms = ['term1'];

      const result = exclusivityPenalty(candidateTerms, groups, highPmiStats);
      expect(result).toBe(0.0); // Should not be exclusive due to high PMI
    });

    it('should properly use co-occurrence thresholds', () => {
      // Test that terms with high co-occurrence are not exclusive
      const highCoocStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map([
          ['term1', 3.0],
          ['term2', 3.0]
        ]),
        pmi: new Map([
          ['term1', new Map([['term2', 0.05]])], // Below threshold
          ['term2', new Map([['term1', 0.05]])]
        ]),
        cooc: new Map([
          ['term1', new Map([['term2', 5]])], // Above threshold (2)
          ['term2', new Map([['term1', 5]])]
        ]),
        totalDocs: 100,
        totalTokens: 1000
      };

      const groups = [['term1'], ['term2']];
      const candidateTerms = ['term1'];

      const result = exclusivityPenalty(candidateTerms, groups, highCoocStats);
      expect(result).toBe(0.0); // Should not be exclusive due to high co-occurrence
    });
  });

  describe('complex scenarios', () => {
    it('should handle overlapping exclusive terms', () => {
      // Create a scenario where multiple terms are exclusive
      const complexStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map([
          ['ai', 3.0],
          ['ml', 3.0],
          ['dl', 3.0],
          ['stats', 3.0]
        ]),
        pmi: new Map([
          ['ai', new Map([['ml', 0.8], ['dl', 0.02], ['stats', 0.01]])],
          ['ml', new Map([['ai', 0.8], ['dl', 0.15], ['stats', 0.03]])],
          ['dl', new Map([['ai', 0.02], ['ml', 0.15], ['stats', 0.9]])],
          ['stats', new Map([['ai', 0.01], ['ml', 0.03], ['dl', 0.9]])]
        ]),
        cooc: new Map([
          ['ai', new Map([['ml', 10], ['dl', 0], ['stats', 0]])],
          ['ml', new Map([['ai', 10], ['dl', 2], ['stats', 1]])],
          ['dl', new Map([['ai', 0], ['ml', 2], ['stats', 15]])],
          ['stats', new Map([['ai', 0], ['ml', 1], ['dl', 15]])]
        ])
      };

      const groups = [['ai', 'ml'], ['dl', 'stats']];
      const candidateTerms = ['ai']; // Has ai (group1) but not dl/stats (group2)

      const result = exclusivityPenalty(candidateTerms, groups, complexStats);
      expect(result).toBeGreaterThan(0); // Should get penalty since dl is exclusive
    });

    it('should handle mixed exclusivity patterns', () => {
      const mixedStats: CorpusStats = {
        ...mockCorpusStats,
        idf: new Map([
          ['web', 2.5],
          ['mobile', 2.5],
          ['backend', 2.5],
          ['frontend', 2.5],
          ['api', 2.5]
        ]),
        pmi: new Map([
          ['web', new Map([['mobile', 0.8], ['backend', 0.6], ['frontend', 0.7], ['api', 0.5]])],
          ['mobile', new Map([['web', 0.8], ['backend', 0.3], ['frontend', 0.4], ['api', 0.2]])],
          ['backend', new Map([['web', 0.6], ['mobile', 0.3], ['frontend', 0.8], ['api', 0.9]])],
          ['frontend', new Map([['web', 0.7], ['mobile', 0.4], ['backend', 0.8], ['api', 0.7]])],
          ['api', new Map([['web', 0.5], ['mobile', 0.2], ['backend', 0.9], ['frontend', 0.7]])]
        ]),
        cooc: new Map([
          ['web', new Map([['mobile', 8], ['backend', 6], ['frontend', 7], ['api', 5]])],
          ['mobile', new Map([['web', 8], ['backend', 2], ['frontend', 3], ['api', 1]])],
          ['backend', new Map([['web', 6], ['mobile', 2], ['frontend', 12], ['frontend', 13]])],
          ['frontend', new Map([['web', 7], ['mobile', 3], ['backend', 12], ['api', 9]])],
          ['api', new Map([['web', 5], ['mobile', 1], ['backend', 13], ['frontend', 9]])]
        ])
      };

      const groups = [['web', 'mobile'], ['backend', 'frontend', 'api']];
      const candidateTerms = ['web', 'backend'];

      const result = exclusivityPenalty(candidateTerms, groups, mixedStats);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1.0);
    });
  });
});