import { HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';

/**
 * Configuration for Reciprocal Rank Fusion (RRF).
 */
export interface RrfConfig {
  k: number; // Constant for RRF formula, typically 60
  vectorWeight: number; // Weight for vector search results
  keywordWeight: number; // Weight for keyword search results
}

/**
 * Interface for a Reciprocal Rank Fusion service.
 */
export interface RrfFusionService {
  /**
   * Fuses results from vector and keyword searches using RRF.
   * @param vectorResults Results from vector search.
   * @param keywordResults Results from keyword search.
   * @param config RRF configuration.
   * @returns Fused results as an array of HybridSearchResult.
   */
  fuseResults(
    vectorResults: VectorSearchResult[],
    keywordResults: HybridSearchResult[],
    config: RrfConfig
  ): HybridSearchResult[];
}

export class ReciprocalRankFusionService implements RrfFusionService {
  fuseResults(
    vectorResults: VectorSearchResult[],
    keywordResults: HybridSearchResult[],
    config: RrfConfig
  ): HybridSearchResult[] {

    // Create maps for efficient lookups
    const vectorMap = new Map<string, { result: VectorSearchResult; rank: number }>();
    const keywordMap = new Map<string, { result: HybridSearchResult; rank: number }>();

    // Index vector results by ID with their ranks
    vectorResults.forEach((result, index) => {
      // Ensure result.id is a string
      if (result.id) {
        vectorMap.set(String(result.id), { result, rank: index + 1 });
      }
    });

    // Index keyword results by ID with their ranks
    keywordResults.forEach((result, index) => {
      // Ensure result.id is a string
      if (result.id) {
        keywordMap.set(String(result.id), { result, rank: index + 1 });
      }
    });

    // Get all unique document IDs
    const allIds = new Set([...vectorMap.keys(), ...keywordMap.keys()]);

    // Calculate RRF scores for each document
    const fusedResults: HybridSearchResult[] = [];
    const internalK = config.k > 0 ? config.k : 1; // Ensure k is at least 1 to avoid division by zero

    for (const id of allIds) {
      const vectorEntry = vectorMap.get(id);
      const keywordEntry = keywordMap.get(id);

      let rrfScore = 0;
      let vectorScore: number | undefined;
      let keywordScore: number | undefined;
      let searchType: 'hybrid' | 'vector_only' | 'keyword_only' = 'hybrid';

      // Calculate RRF contribution from vector search
      if (vectorEntry) {
        const rank = vectorEntry.rank;
        const score = vectorEntry.result.score || 0;
        rrfScore += config.vectorWeight * (1 / (rank + internalK));
        vectorScore = score;
      }

      // Calculate RRF contribution from keyword search
      if (keywordEntry) {
        const rank = keywordEntry.rank;
        const score = keywordEntry.result.score || 0;
        rrfScore += config.keywordWeight * (1 / (rank + internalK));
        keywordScore = score;
      }

      // Determine search type
      if (vectorEntry && keywordEntry) {
        searchType = 'hybrid';
      } else if (vectorEntry) {
        searchType = 'vector_only';
      } else {
        searchType = 'keyword_only';
      }

      // Get document content and payload (prefer keyword result over vector result if hybrid)
      const sourceResult = keywordEntry?.result || vectorEntry?.result;
      if (!sourceResult) continue;

      fusedResults.push({
        id,
        score: rrfScore, // This is the combined RRF score
        vectorScore,
        keywordScore,
        fusionScore: rrfScore, // Fusion score is the RRF score here
        searchType,
        payload: sourceResult.payload,
        content: this.extractContent(sourceResult) // Use the extractContent helper
      });
    }

    // Sort by RRF score (descending)
    fusedResults.sort((a, b) => (b.fusionScore || 0) - (a.fusionScore || 0)); // Add nullish coalescing for safety

    return fusedResults;
  }

  private extractContent(result: VectorSearchResult | HybridSearchResult): string | undefined {
    // For HybridSearchResult (which keyword results now are), content is directly available
    if (this.isHybridSearchResult(result) && result.content) {
      return result.content;
    }

    // For VectorSearchResult, content is in payload
    if (this.isVectorSearchResult(result) && result.payload?.content) {
      return result.payload.content;
    }

    return undefined;
  }

  private isHybridSearchResult(result: any): result is HybridSearchResult {
    return 'content' in result && typeof result.content === 'string';
  }

  private isVectorSearchResult(result: any): result is VectorSearchResult {
    return 'vector' in result && Array.isArray(result.vector);
  }
}

// Advanced RRF implementation with score normalization
export class NormalizedRrfFusionService implements RrfFusionService {
  fuseResults(
    vectorResults: VectorSearchResult[],
    keywordResults: HybridSearchResult[],
    config: RrfConfig
  ): HybridSearchResult[] {
    // Normalize scores before fusion
    const normalizedVectorResults = this.normalizeScores(vectorResults);
    const normalizedKeywordResults = this.normalizeScores(keywordResults);

    // Create fusion map
    const fusionMap = new Map<string, HybridSearchResult>();

    const internalK = config.k > 0 ? config.k : 1; // Ensure k is at least 1

    // Process vector results
    normalizedVectorResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfContribution = config.vectorWeight * (1 / (rank + internalK));
      const normalizedScoreContribution = config.vectorWeight * (result.score || 0);

      fusionMap.set(String(result.id), {
        id: String(result.id),
        score: rrfContribution + normalizedScoreContribution,
        vectorScore: result.score,
        fusionScore: rrfContribution + normalizedScoreContribution,
        searchType: 'vector_only',
        payload: result.payload,
        content: this.extractContent(result) // Use extractContent helper for consistency
      });
    });

    // Process keyword results and merge
    normalizedKeywordResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfContribution = config.keywordWeight * (1 / (rank + internalK));
      const normalizedScoreContribution = config.keywordWeight * (result.score || 0);

      const existingResult = fusionMap.get(String(result.id));
      if (existingResult) {
        // Merge with existing vector result
        existingResult.score = (existingResult.score || 0) + rrfContribution + normalizedScoreContribution;
        existingResult.fusionScore = (existingResult.fusionScore || 0) + rrfContribution + normalizedScoreContribution;
        existingResult.keywordScore = result.score;
        existingResult.searchType = 'hybrid';
        existingResult.content = this.extractContent(result); // Use extractContent helper
      } else {
        // Create new keyword-only result
        fusionMap.set(String(result.id), {
          id: String(result.id),
          score: rrfContribution + normalizedScoreContribution,
          keywordScore: result.score,
          fusionScore: rrfContribution + normalizedScoreContribution,
          searchType: 'keyword_only',
          payload: result.payload,
          content: this.extractContent(result) // Use extractContent helper
        });
      }
    });

    // Convert to array and sort
    const fusedResults = Array.from(fusionMap.values());
    fusedResults.sort((a, b) => (b.fusionScore || 0) - (a.fusionScore || 0));

    return fusedResults;
  }

  private normalizeScores<T extends { id: string; score?: number; payload?: any; content?: string }>(results: T[]): (T & { score: number })[] {
    if (results.length === 0) return [];

    const scores = results.map(r => r.score || 0);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreRange = maxScore - minScore;

    if (scoreRange === 0) {
      return results.map(r => ({ ...r, score: (r.score || 0) > 0 ? 1.0 : 0.0 }));
    }

    return results.map(result => ({
      ...result,
      score: ((result.score || 0) - minScore) / scoreRange
    }));
  }

  private extractContent(result: VectorSearchResult | HybridSearchResult): string | undefined {
    if (this.isHybridSearchResult(result) && result.content) {
      return result.content;
    }
    if (this.isVectorSearchResult(result) && result.payload?.content) {
      return result.payload.content;
    }
    return undefined;
  }

  private isHybridSearchResult(result: any): result is HybridSearchResult {
    return 'content' in result && typeof result.content === 'string' && 'fusionScore' in result;
  }

  private isVectorSearchResult(result: any): result is VectorSearchResult {
    // VectorSearchResult doesn't have 'content' directly, but has 'vector'
    return 'vector' in result && Array.isArray(result.vector) && !('content' in result);
  }
}

// Utility class for RRF performance monitoring
export class RrfPerformanceMonitor {
  static measureFusion<T>(
    fusionFn: () => T,
    vectorCount: number,
    keywordCount: number
  ): { result: T; metrics: Partial<SearchPerformanceMetrics> } {
    const startTime = performance.now();
    const result = fusionFn();
    const endTime = performance.now();

    const metrics: Partial<SearchPerformanceMetrics> = {
      fusionDuration: endTime - startTime,
      vectorResultCount: vectorCount,
      keywordResultCount: keywordCount,
      finalResultCount: Array.isArray(result) ? result.length : 0
    };

    return { result, metrics };
  }
}