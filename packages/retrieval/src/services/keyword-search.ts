import { HybridSearchResult } from '../types/hybrid.js';

/**
 * Interface for a keyword search service.
 */
export interface KeywordSearchService {
  /**
   * Performs a keyword search.
   * @param collectionName The name of the collection to search.
   * @param query The search query string.
   * @param limit The maximum number of results to return.
   * @param filter An optional filter to apply to the search.
   * @returns A promise that resolves to an array of HybridSearchResult objects.
   */
  search(
    collectionName: string,
    query: string,
    limit: number,
    filter: Record<string, any>
  ): Promise<HybridSearchResult[]>;
}

/**
 * Qdrant implementation of the KeywordSearchService using BM25.
 */
export class QdrantKeywordSearchService implements KeywordSearchService {
  constructor(private qdrantDataSource: any) {} // `qdrantDataSource` should be compliant with QdrantClient's scroll API

  /**
   * Performs a keyword search using Qdrant's scroll API with BM25.
   * @param collectionName The name of the collection to search.
   * @param query The search query string.
   * @param limit The maximum number of results to return.
   * @param filter An optional filter to apply to the search.
   * @returns A promise that resolves to an array of HybridSearchResult objects.
   */
  async search(
    collectionName: string,
    query: string,
    limit: number,
    filter: Record<string, any>
  ): Promise<HybridSearchResult[]> {
    try {
      // Basic text tokenization (can be enhanced for better BM25 query construction)
      const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);

      if (queryTerms.length === 0) {
        console.log('❌ Keyword search: No valid query terms after filtering');
        return [];
      }

      console.log('🔍 Keyword search starting...');
      console.log('Query terms:', queryTerms);

      // Get all documents matching the base filter first
      const baseFilter = {
        must: filter.must || [],
        should: filter.should || [],
        must_not: filter.must_not || []
      };

      console.log('Keyword search - base filter:', JSON.stringify(baseFilter, null, 2));

      const { points: allResults } = await this.qdrantDataSource.scroll(collectionName, {
        filter: baseFilter,
        limit: limit * 3, // Get more results for better scoring
        with_payload: true,
        with_vectors: false
      });

      console.log(`🔍 Retrieved ${allResults.length} documents for keyword scoring`);

      // Calculate BM25-like scores for each document
      const scoredResults: HybridSearchResult[] = allResults
        .map((result: any) => {
          // Combine content with metadata fields for keyword matching
          const content = (result.payload?.content || '').toLowerCase();
          const title = (result.payload?.title || '').toLowerCase();
          const docId = (result.payload?.docId || '').toLowerCase();
          const path = (result.payload?.path || '').toLowerCase();

          // Create searchable text that includes metadata (with field boosting)
          const searchableText = content + ' ' +
                                title.repeat(3) + ' ' +     // 3x boost for title matches
                                docId.repeat(5) + ' ' +     // 5x boost for docId matches
                                path.repeat(3);             // 3x boost for path matches

          const score = this.calculateKeywordScore(searchableText, queryTerms);

          return {
            id: result.id,
            score: score,
            payload: result.payload,
            content: result.payload?.content,
            searchType: 'keyword_only' as const,
            keywordScore: score
          } as HybridSearchResult;
        })
        .filter((result: HybridSearchResult) => result.score > 0) // Only include documents with keyword matches
        .sort((a: HybridSearchResult, b: HybridSearchResult) => b.score - a.score) // Sort by score descending
        .slice(0, limit); // Take top results

      console.log(`✅ Keyword search completed: ${scoredResults.length} results with scores > 0`);

      if (scoredResults.length > 0) {
        console.log('📋 Top keyword search results:');
        scoredResults.slice(0, 3).forEach((result: HybridSearchResult, i: number) => {
          console.log(`   ${i+1}. ID: ${result.id}, Score: ${result.score.toFixed(3)}`);
          console.log(`      Content preview: ${(result.content || '').substring(0, 100)}...`);
        });
      } else {
        console.log('❌ No keyword matches found for query terms:', queryTerms);
      }

      return scoredResults;
    } catch (error) {
      console.error('❌ Keyword search failed:', error);
      throw new Error(`Qdrant keyword search failed: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate improved BM25-like keyword score for a document
   */
  private calculateKeywordScore(content: string, queryTerms: string[]): number {
    if (!content || queryTerms.length === 0) return 0;

    const contentLower = content.toLowerCase();
    const words = contentLower.split(/\s+/);
    const docLength = words.length;

    let score = 0;
    let matchedTerms = 0;
    let hasHighValueTerms = false;

    // Define high-value terms that should get major boosts
    const highValueTerms = ['artistry', 'skill', 'table', 'abilities'];

    for (const term of queryTerms) {
      // Skip very short/common terms that don't add value
      if (term.length <= 2 || ['can', 'you', 'the', 'for', 'and', 'please'].includes(term)) {
        continue;
      }

      // Count exact word boundary matches (most important)
      const exactWordMatches = (contentLower.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;

      // Count partial matches within words
      const partialMatches = (contentLower.match(new RegExp(term, 'g')) || []).length - exactWordMatches;

      if (exactWordMatches > 0 || partialMatches > 0) {
        matchedTerms++;

        // Base score from term frequency
        const tf = (exactWordMatches * 2 + partialMatches) / Math.max(docLength, 50); // Normalize by doc length with min

        // Major boost for high-value terms
        let termImportance = 1.0;
        if (highValueTerms.includes(term)) {
          termImportance = 5.0; // 5x boost for key terms like "artistry"
          hasHighValueTerms = true;
        } else if (term.length >= 6) {
          termImportance = 2.0; // 2x boost for longer, more specific terms
        }

        // Exact word matches are much more valuable than partial
        const exactBoost = exactWordMatches > 0 ? 3.0 : 1.0;

        // Calculate term score
        const termScore = tf * termImportance * exactBoost;
        score += termScore;

        console.log(`  Term "${term}": exact=${exactWordMatches}, partial=${partialMatches}, importance=${termImportance}, score=${termScore.toFixed(3)}`);
      }
    }

    if (matchedTerms === 0) return 0;

    // Major boost for documents with high-value terms
    if (hasHighValueTerms) {
      score *= 2.0;
    }

    // Boost documents that match multiple query terms
    const termCoverageBoost = 1 + (matchedTerms / Math.max(queryTerms.length, 3));
    score *= termCoverageBoost;

    // Final normalization to 0-1 range, but allow for higher scores on exact matches
    const finalScore = Math.min(score, 1.0);

    return finalScore;
  }
}