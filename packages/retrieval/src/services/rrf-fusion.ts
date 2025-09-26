import { HybridSearchResult, SearchPerformanceMetrics } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';
import { fuse, FusionConfig } from './fusion.js';

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
    // Convert to new fusion format
    const vectorInputs = vectorResults.map((result, index) => ({
      id: String(result.id),
      score: result.score || 0,
      rank: index + 1
    }));

    const keywordInputs = keywordResults.map((result, index) => ({
      id: String(result.id),
      score: result.score || 0,
      rank: index + 1
    }));

    const fusionConfig: FusionConfig = {
      strategy: "borda_rank", // Use rank-only fusion (equivalent to old RRF)
      kParam: config.k,
      vectorWeight: config.vectorWeight,
      keywordWeight: config.keywordWeight,
      normalization: "none" // No normalization for backward compatibility
    };

    const fusionResults = fuse(vectorInputs, keywordInputs, fusionConfig);

    // Convert back to HybridSearchResult format
    return fusionResults.map(fusionResult => {
      // Find original result data
      const vectorResult = vectorResults.find(r => String(r.id) === fusionResult.id);
      const keywordResult = keywordResults.find(r => String(r.id) === fusionResult.id);
      const sourceResult = keywordResult || vectorResult;

      if (!sourceResult) return null;

      return {
        id: fusionResult.id,
        score: fusionResult.fusedScore,
        vectorScore: fusionResult.components.vector || (vectorResult ? vectorResult.score : undefined),
        keywordScore: fusionResult.components.keyword || (keywordResult ? keywordResult.score : undefined),
        fusionScore: fusionResult.fusedScore,
        searchType: vectorResult && keywordResult ? 'hybrid' :
                   vectorResult ? 'vector_only' : 'keyword_only',
        payload: sourceResult.payload,
        content: this.extractContent(sourceResult)
      };
    }).filter(Boolean) as HybridSearchResult[];
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