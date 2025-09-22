import {
  HybridSearchServiceImpl,
  CachedHybridSearchService
} from '../src/services/hybrid-search.js';
import {
  KeywordSearchService
} from '../src/services/keyword-search.js';
import {
  ReciprocalRankFusionService,
  NormalizedRrfFusionService,
  RrfPerformanceMonitor
} from '../src/services/rrf-fusion.js';
import {
  HybridSearchRequest,
} from '../src/types/hybrid.js';
import { VectorSearchResult, VectorSearchParams } from '../src/types/vector.js';

// Performance-focused mock implementations
class PerformanceVectorSearchService {
  private searchDuration: number;

  constructor(simulatedDuration = 100) {
    this.searchDuration = simulatedDuration;
  }

  async search(collectionName: string, params: VectorSearchParams): Promise<VectorSearchResult[]> {
    const startTime = performance.now();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, this.searchDuration));

    const endTime = performance.now();
    const actualDuration = endTime - startTime;

    // Generate realistic results
    const results: VectorSearchResult[] = Array.from({ length: params.limit }, (_, i) => ({
      id: `vector_doc_${i}`,
      vector: params.queryVector,
      score: 0.9 - (i * 0.1),
      payload: {
        tenant: 'perf_tenant',
        acl: ['perf_user'],
        content: `Performance test document ${i} with vector search`,
        docId: `vector_doc_${i}`
      }
    }));

    console.log(`Vector search took ${actualDuration}ms (target: ${this.searchDuration}ms)`);
    return results;
  }

  setDuration(duration: number) {
    this.searchDuration = duration;
  }
}

class PerformanceKeywordSearchService implements KeywordSearchService {
  private searchDuration: number;

  constructor(simulatedDuration = 50) {
    this.searchDuration = simulatedDuration;
  }

  async search(
    collectionName: string,
    query: string,
    limit: number,
  ) {
    const startTime = performance.now();

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, this.searchDuration));

    const endTime = performance.now();
    const actualDuration = endTime - startTime;

    // Generate realistic results
    const results = Array.from({ length: limit }, (_, i) => ({
      id: `keyword_doc_${i}`,
      score: 0.85 - (i * 0.05),
      payload: {
        tenant: 'perf_tenant',
        acl: ['perf_user'],
        content: `Performance test document ${i} with keyword search`
      },
      content: `Performance test document ${i} with keyword search`
    }));

    console.log(`Keyword search took ${actualDuration}ms (target: ${this.searchDuration}ms)`);
    return results;
  }

  setDuration(duration: number) {
    this.searchDuration = duration;
  }
}

class FastEmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Ultra-fast embedding simulation
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 384 }, (_, i) => Math.sin(hash + i) * 0.1);
  }
}

describe('Hybrid Search Performance Tests', () => {
  let hybridSearchService: HybridSearchServiceImpl;
  let performanceVectorService: PerformanceVectorSearchService;
  let performanceKeywordService: PerformanceKeywordSearchService;
  let fastEmbeddingService: FastEmbeddingService;
  let rrfFusionService: ReciprocalRankFusionService;

  const userTenants = ['perf_tenant'];
  const userAcl = ['perf_user'];

  beforeEach(() => {
    performanceVectorService = new PerformanceVectorSearchService();
    performanceKeywordService = new PerformanceKeywordSearchService();
    fastEmbeddingService = new FastEmbeddingService();
    rrfFusionService = new ReciprocalRankFusionService();

    hybridSearchService = new HybridSearchServiceImpl(
      performanceVectorService,
      performanceKeywordService,
      rrfFusionService,
      fastEmbeddingService
    );
  });

  describe('Latency Requirements Validation', () => {
    it('should meet vector search latency target (<200ms)', async () => {
      performanceVectorService.setDuration(150); // Simulate 150ms vector search

      const request: HybridSearchRequest = {
        query: 'performance test vector search',
        limit: 10,
        enableKeywordSearch: false // Vector only
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(metrics.vectorSearchDuration).toBeLessThan(200);
      console.log(`Vector search duration: ${metrics.vectorSearchDuration}ms (target: <200ms)`);
    });

    it('should meet keyword search latency target (<100ms)', async () => {
      performanceKeywordService.setDuration(80); // Simulate 80ms keyword search

      const request: HybridSearchRequest = {
        query: 'performance test keyword search',
        limit: 10,
        enableKeywordSearch: true,
        vectorWeight: 0, // Keyword heavy to focus on keyword performance
        keywordWeight: 1
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(metrics.keywordSearchDuration).toBeLessThan(100);
      console.log(`Keyword search duration: ${metrics.keywordSearchDuration}ms (target: <100ms)`);
    });

    it('should meet RRF fusion latency target (<50ms)', async () => {
      const request: HybridSearchRequest = {
        query: 'performance test RRF fusion',
        limit: 20, // Larger result set to test fusion performance
        enableKeywordSearch: true,
        vectorWeight: 0.5,
        keywordWeight: 0.5,
        rrfK: 60
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(metrics.fusionDuration).toBeLessThan(50);
      console.log(`RRF fusion duration: ${metrics.fusionDuration}ms (target: <50ms)`);
    });

    it('should meet total hybrid search latency target (<500ms)', async () => {
      performanceVectorService.setDuration(180); // Near vector target
      performanceKeywordService.setDuration(90);  // Near keyword target

      const request: HybridSearchRequest = {
        query: 'performance test complete hybrid search pipeline',
        limit: 15,
        enableKeywordSearch: true,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        rrfK: 60
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(metrics.totalDuration).toBeLessThan(500);

      console.log(`Total hybrid search duration: ${metrics.totalDuration}ms (target: <500ms)`);
      console.log(`  - Vector: ${metrics.vectorSearchDuration}ms`);
      console.log(`  - Keyword: ${metrics.keywordSearchDuration}ms`);
      console.log(`  - Fusion: ${metrics.fusionDuration}ms`);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with concurrent searches', async () => {
      const request: HybridSearchRequest = {
        query: 'concurrent search test',
        limit: 10,
        enableKeywordSearch: true
      };

      const concurrentSearches = 10;
      const searchPromises = Array.from({ length: concurrentSearches }, () =>
        hybridSearchService.searchLegacy('perf_collection', request, userTenants, userAcl)
      );

      const startTime = performance.now();
      const results = await Promise.all(searchPromises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / concurrentSearches;

      expect(results).toHaveLength(concurrentSearches);
      results.forEach(({ results: searchResults, metrics }) => {
        expect(searchResults).toBeDefined();
        expect(metrics.totalDuration).toBeLessThan(1000); // Allow more time under load
      });

      console.log(`${concurrentSearches} concurrent searches completed in ${totalTime}ms`);
      console.log(`Average time per search: ${averageTime}ms`);
    });

    it('should handle large result sets efficiently', async () => {
      const request: HybridSearchRequest = {
        query: 'large result set performance test',
        limit: 100, // Large result set
        enableKeywordSearch: true,
        vectorWeight: 0.5,
        keywordWeight: 0.5
      };

      const { results, metrics } = await hybridSearchService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(100);

      // Even with large result sets, should meet targets
      expect(metrics.fusionDuration).toBeLessThan(100); // Allow more time for larger sets
      expect(metrics.totalDuration).toBeLessThan(1000);

      console.log(`Large result set (${results.length} items) fusion: ${metrics.fusionDuration}ms`);
    });

    it('should demonstrate caching performance benefits', async () => {
      const cachedService = new CachedHybridSearchService(
        performanceVectorService,
        performanceKeywordService,
        rrfFusionService,
        fastEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'cache performance test',
        limit: 10,
        enableKeywordSearch: true
      };

      // First search (cold cache)
      const firstSearchStart = performance.now();
      const firstResult = await cachedService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );
      const firstSearchEnd = performance.now();
      const firstSearchTime = firstSearchEnd - firstSearchStart;

      // Second search (warm cache)
      const secondSearchStart = performance.now();
      const secondResult = await cachedService.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );
      const secondSearchEnd = performance.now();
      const secondSearchTime = secondSearchEnd - secondSearchStart;

      expect(firstResult.results).toEqual(secondResult.results);
      expect(secondSearchTime).toBeLessThan(firstSearchTime * 0.1); // Cache should be 10x faster

      console.log(`First search (cold cache): ${firstSearchTime}ms`);
      console.log(`Second search (warm cache): ${secondSearchTime}ms`);
      console.log(`Cache speedup: ${(firstSearchTime / secondSearchTime).toFixed(1)}x`);
    });
  });

  describe('RRF Algorithm Performance', () => {
    it('should measure RRF performance with different result set sizes', () => {
      const vectorResults: VectorSearchResult[] = Array.from({ length: 100 }, (_, i) => ({
        id: `vector_${i}`,
        vector: [],
        score: Math.random(),
        payload: { content: `Vector content ${i}` }
      }));

      const keywordResults = Array.from({ length: 100 }, (_, i) => ({
        id: `keyword_${i}`,
        score: Math.random(),
        payload: { content: `Keyword content ${i}` },
        content: `Keyword content ${i}`
      }));

      const config = { k: 60, vectorWeight: 0.7, keywordWeight: 0.3 };

      const { result, metrics } = RrfPerformanceMonitor.measureFusion(
        () => rrfFusionService.fuseResults(vectorResults, keywordResults, config),
        vectorResults.length,
        keywordResults.length
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(metrics.fusionDuration).toBeLessThan(50);

      console.log(`RRF fusion of ${vectorResults.length}+${keywordResults.length} results: ${metrics.fusionDuration}ms`);
    });

    it('should compare RRF vs Normalized RRF performance', () => {
      const vectorResults: VectorSearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        id: `vector_${i}`,
        vector: [],
        score: Math.random() * 100, // Wide score range for normalization test
        payload: { content: `Vector content ${i}` }
      }));

      const keywordResults = Array.from({ length: 50 }, (_, i) => ({
        id: `keyword_${i}`,
        score: Math.random() * 10, // Different score range
        payload: { content: `Keyword content ${i}` },
        content: `Keyword content ${i}`
      }));

      const config = { k: 60, vectorWeight: 0.7, keywordWeight: 0.3 };
      const normalizedRrfService = new NormalizedRrfFusionService();

      // Standard RRF
      const standardRrf = RrfPerformanceMonitor.measureFusion(
        () => rrfFusionService.fuseResults(vectorResults, keywordResults, config),
        vectorResults.length,
        keywordResults.length
      );

      // Normalized RRF
      const normalizedRrf = RrfPerformanceMonitor.measureFusion(
        () => normalizedRrfService.fuseResults(vectorResults, keywordResults, config),
        vectorResults.length,
        keywordResults.length
      );

      expect(standardRrf.result).toBeDefined();
      expect(normalizedRrf.result).toBeDefined();

      // Both should be fast, normalized might be slightly slower due to normalization
      expect(standardRrf.metrics.fusionDuration).toBeLessThan(50);
      expect(normalizedRrf.metrics.fusionDuration).toBeLessThan(100);

      console.log(`Standard RRF: ${standardRrf.metrics.fusionDuration}ms`);
      console.log(`Normalized RRF: ${normalizedRrf.metrics.fusionDuration}ms`);
    });
  });

  describe('Memory Usage and Optimization', () => {
    it('should handle memory efficiently with large datasets', async () => {
      // Simulate memory pressure with large result sets
      performanceVectorService = new PerformanceVectorSearchService(50);
      performanceKeywordService = new PerformanceKeywordSearchService(30);

      const service = new HybridSearchServiceImpl(
        performanceVectorService,
        performanceKeywordService,
        rrfFusionService,
        fastEmbeddingService
      );

      const request: HybridSearchRequest = {
        query: 'memory efficiency test with large dataset simulation',
        limit: 1000, // Large limit to test memory handling
        enableKeywordSearch: true
      };

      const { results, metrics } = await service.searchLegacy(
        'perf_collection',
        request,
        userTenants,
        userAcl
      );

      expect(results).toBeDefined();
      expect(metrics.totalDuration).toBeLessThan(2000); // Allow more time for large sets

      console.log(`Large dataset (${results.length} results) handled in ${metrics.totalDuration}ms`);
    });
  });

  describe('Performance Regression Tests', () => {
    it('should maintain consistent performance across multiple runs', async () => {
      const request: HybridSearchRequest = {
        query: 'consistent performance test',
        limit: 10,
        enableKeywordSearch: true
      };

      const runs = 5;
      const durations: number[] = [];

      for (let i = 0; i < runs; i++) {
        const { metrics } = await hybridSearchService.searchLegacy(
          'perf_collection',
          request,
          userTenants,
          userAcl
        );
        durations.push(metrics.totalDuration);
      }

      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      const variance = maxDuration - minDuration;

      expect(averageDuration).toBeLessThan(500);
      expect(variance).toBeLessThan(averageDuration * 0.5); // Variance should be less than 50% of average

      console.log(`Performance consistency over ${runs} runs:`);
      console.log(`  Average: ${averageDuration.toFixed(2)}ms`);
      console.log(`  Min: ${minDuration.toFixed(2)}ms`);
      console.log(`  Max: ${maxDuration.toFixed(2)}ms`);
      console.log(`  Variance: ${variance.toFixed(2)}ms`);
    });
  });

  afterAll(() => {
    console.log('\n=== Performance Test Summary ===');
    console.log('Target Performance Requirements:');
    console.log('  Vector search: <200ms');
    console.log('  Keyword search: <100ms');
    console.log('  RRF fusion: <50ms');
    console.log('  Total hybrid search: <500ms');
    console.log('All tests should validate these requirements are met.');
  });
});