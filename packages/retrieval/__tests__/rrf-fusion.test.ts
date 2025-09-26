import {
  ReciprocalRankFusionService,
  NormalizedRrfFusionService,
  RrfPerformanceMonitor,
  RrfConfig
} from '../src/services/rrf-fusion.js';
import { HybridSearchResult } from '../src/types/hybrid.js';
import { VectorSearchResult } from '../src/types/vector.js';

describe('RRF Fusion Services', () => {
  let rrfService: ReciprocalRankFusionService;
  let normalizedRrfService: NormalizedRrfFusionService;

  beforeEach(() => {
    rrfService = new ReciprocalRankFusionService();
    normalizedRrfService = new NormalizedRrfFusionService();
  });

  describe('ReciprocalRankFusionService', () => {
    const defaultConfig: RrfConfig = {
      k: 60,
      vectorWeight: 0.7,
      keywordWeight: 0.3
    };

    it('should fuse vector and keyword results correctly', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.9, payload: { content: 'test content 1' } },
        { id: 'doc2', vector: [], score: 0.8, payload: { content: 'test content 2' } },
        { id: 'doc3', vector: [], score: 0.7, payload: { content: 'test content 3' } }
      ];

      const keywordResults = [
        { id: 'doc2', score: 0.95, payload: { content: 'test content 2' }, content: 'test content 2' },
        { id: 'doc4', score: 0.85, payload: { content: 'test content 4' }, content: 'test content 4' },
        { id: 'doc1', score: 0.75, payload: { content: 'test content 1' }, content: 'test content 1' }
      ];

      const results = rrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(4);
      expect(results[0].searchType).toBe('hybrid'); // doc1 or doc2 should be top
      expect(results.find(r => r.id === 'doc3')?.searchType).toBe('vector_only');
      expect(results.find(r => r.id === 'doc4')?.searchType).toBe('keyword_only');
    });

    it('should calculate RRF scores correctly', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 1.0, payload: { content: 'content' } }
      ];

      const keywordResults = [
        { id: 'doc1', score: 1.0, payload: { content: 'content' }, content: 'content' }
      ];

      const config: RrfConfig = { k: 60, vectorWeight: 0.7, keywordWeight: 0.3 };
      const results = rrfService.fuseResults(vectorResults, keywordResults, config);

      expect(results).toHaveLength(1);

      // RRF score should be: 0.7/(60+1) + 0.3/(60+1) = 1.0/61 ≈ 0.0164
      const expectedScore = config.vectorWeight / (config.k + 1) + config.keywordWeight / (config.k + 1);
      expect(results[0].fusionScore).toBeCloseTo(expectedScore, 4);
    });

    it('should handle empty vector results', () => {
      const vectorResults: VectorSearchResult[] = [];
      const keywordResults = [
        { id: 'doc1', score: 0.9, payload: { content: 'content' }, content: 'content' }
      ];

      const results = rrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(1);
      expect(results[0].searchType).toBe('keyword_only');
      expect(results[0].vectorScore).toBeUndefined();
      expect(results[0].keywordScore).toBe(0.9);
    });

    it('should handle empty keyword results', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.9, payload: { content: 'content' } }
      ];
      const keywordResults: any[] = [];

      const results = rrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(1);
      expect(results[0].searchType).toBe('vector_only');
      expect(results[0].vectorScore).toBe(0.9);
      expect(results[0].keywordScore).toBeUndefined();
    });

    it('should handle both empty results', () => {
      const vectorResults: VectorSearchResult[] = [];
      const keywordResults: any[] = [];

      const results = rrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(0);
    });

    it('should sort results by fusion score descending', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.5, payload: { content: 'content1' } }, // rank 1
        { id: 'doc2', vector: [], score: 0.9, payload: { content: 'content2' } }  // rank 2
      ];

      const keywordResults = [
        { id: 'doc2', score: 0.8, payload: { content: 'content2' }, content: 'content2' }, // rank 1
        { id: 'doc1', score: 0.6, payload: { content: 'content1' }, content: 'content1' }  // rank 2
      ];

      const results = rrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(2);
      // Results should be sorted by fusion score
      expect(results[0].fusionScore!).toBeGreaterThanOrEqual(results[1].fusionScore!);
    });

    it('should respect different RRF k values', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 1.0, payload: { content: 'content' } }
      ];
      const keywordResults = [
        { id: 'doc1', score: 1.0, payload: { content: 'content' }, content: 'content' }
      ];

      const configK10: RrfConfig = { k: 10, vectorWeight: 0.5, keywordWeight: 0.5 };
      const configK100: RrfConfig = { k: 100, vectorWeight: 0.5, keywordWeight: 0.5 };

      const resultsK10 = rrfService.fuseResults(vectorResults, keywordResults, configK10);
      const resultsK100 = rrfService.fuseResults(vectorResults, keywordResults, configK100);

      // Smaller k should result in higher scores
      expect(resultsK10[0].fusionScore!).toBeGreaterThan(resultsK100[0].fusionScore!);
    });

    it('should respect weight configurations', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 1.0, payload: { content: 'content' } },
        { id: 'doc2', vector: [], score: 0.8, payload: { content: 'content2' } }
      ];
      const keywordResults = [
        { id: 'doc2', score: 1.0, payload: { content: 'content2' }, content: 'content2' },
        { id: 'doc1', score: 0.8, payload: { content: 'content' }, content: 'content' }
      ];

      const vectorHeavyConfig: RrfConfig = { k: 60, vectorWeight: 0.9, keywordWeight: 0.1 };
      const keywordHeavyConfig: RrfConfig = { k: 60, vectorWeight: 0.1, keywordWeight: 0.9 };

      const vectorHeavyResults = rrfService.fuseResults(vectorResults, keywordResults, vectorHeavyConfig);
      const keywordHeavyResults = rrfService.fuseResults(vectorResults, keywordResults, keywordHeavyConfig);

      // Find doc1 in both results to compare fusion scores
      const doc1VectorHeavy = vectorHeavyResults.find(r => r.id === 'doc1')!;
      const doc1KeywordHeavy = keywordHeavyResults.find(r => r.id === 'doc1')!;

      // Both should have same structure but different weight distributions
      expect(doc1VectorHeavy.fusionScore).not.toEqual(doc1KeywordHeavy.fusionScore);
    });
  });

  describe('NormalizedRrfFusionService', () => {
    const defaultConfig: RrfConfig = {
      k: 60,
      vectorWeight: 0.7,
      keywordWeight: 0.3
    };

    it('should normalize scores before fusion', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 100, payload: { content: 'content1' } },
        { id: 'doc2', vector: [], score: 50, payload: { content: 'content2' } }
      ];

      const keywordResults = [
        { id: 'doc1', score: 2, payload: { content: 'content1' }, content: 'content1' },
        { id: 'doc2', score: 1, payload: { content: 'content2' }, content: 'content2' }
      ];

      const results = normalizedRrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(2);
      // After normalization, both results should have reasonable fusion scores
      expect(results[0].fusionScore).toBeGreaterThan(0);
      expect(results[0].fusionScore).toBeLessThan(2); // Should be normalized
    });

    it('should handle zero score range gracefully', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.5, payload: { content: 'content1' } },
        { id: 'doc2', vector: [], score: 0.5, payload: { content: 'content2' } }
      ];

      const keywordResults = [
        { id: 'doc1', score: 0.8, payload: { content: 'content1' }, content: 'content1' },
        { id: 'doc2', score: 0.8, payload: { content: 'content2' }, content: 'content2' }
      ];

      const results = normalizedRrfService.fuseResults(vectorResults, keywordResults, defaultConfig);

      expect(results).toHaveLength(2);
      // All scores should be normalized to 1.0 when range is 0
      results.forEach(result => {
        expect(result.fusionScore).toBeGreaterThan(0);
      });
    });
  });

  describe('RrfPerformanceMonitor', () => {
    it('should measure fusion performance', () => {
      const mockFusion = jest.fn().mockReturnValue([
        { id: 'doc1', fusionScore: 0.9, searchType: 'hybrid' as const }
      ]);

      const { result, metrics } = RrfPerformanceMonitor.measureFusion(
        mockFusion,
        5, // vectorCount
        3  // keywordCount
      );

      expect(mockFusion).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(metrics.fusionDuration).toBeGreaterThanOrEqual(0);
      expect(metrics.vectorResultCount).toBe(5);
      expect(metrics.keywordResultCount).toBe(3);
      expect(metrics.finalResultCount).toBe(1);
    });

    it('should handle non-array results', () => {
      const mockFusion = jest.fn().mockReturnValue('not an array');

      const { result, metrics } = RrfPerformanceMonitor.measureFusion(
        mockFusion,
        0,
        0
      );

      expect(result).toBe('not an array');
      expect(metrics.finalResultCount).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    const testConfig: RrfConfig = {
      k: 60,
      vectorWeight: 0.7,
      keywordWeight: 0.3
    };

    it('should handle documents with missing content', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.9, payload: {} } // No content
      ];

      const keywordResults = [
        { id: 'doc1', score: 0.8, payload: {} } // No content
      ];

      const results = rrfService.fuseResults(vectorResults, keywordResults, testConfig);

      expect(results).toHaveLength(1);
      expect(results[0].content).toBeUndefined();
    });

    it('should prefer keyword content over vector content', () => {
      const vectorResults: VectorSearchResult[] = [
        { id: 'doc1', vector: [], score: 0.9, payload: { content: 'vector content' } }
      ];

      const keywordResults = [
        { id: 'doc1', score: 0.8, payload: { content: 'payload content' }, content: 'keyword content' }
      ];

      const results = rrfService.fuseResults(vectorResults, keywordResults, testConfig);

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('keyword content');
    });

    it('should handle very large result sets efficiently', () => {
      const vectorResults: VectorSearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `doc${i}`,
        vector: [],
        score: Math.random(),
        payload: { content: `content ${i}` }
      }));

      const keywordResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `doc${i + 500}`, // Overlap with second half of vector results
        score: Math.random(),
        payload: { content: `content ${i + 500}` },
        content: `content ${i + 500}`
      }));

      const startTime = performance.now();
      const results = rrfService.fuseResults(vectorResults, keywordResults, testConfig);
      const endTime = performance.now();

      expect(results.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});