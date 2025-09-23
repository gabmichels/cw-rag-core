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
        return [];
      }

      // BM25-like search using Qdrant's `should` filter with `text` match
      const textMatchFilters = queryTerms.map(term => ({
        key: 'content', // Assuming documents have a 'content' field
        match: { text: term }
      }));

      // Combine text match filters with the provided filter
      const combinedFilter = {
        must: [
          ...(filter.must || []), // Existing must conditions
          ...(textMatchFilters.length > 0 ? [{ should: textMatchFilters }] : [])
        ],
        should: filter.should || [],
        must_not: filter.must_not || []
      };

      console.log('Keyword search - filter:', JSON.stringify(combinedFilter, null, 2));
      console.log('Keyword search - query:', query);
      console.log('Keyword search - limit:', limit);

      const { points: results } = await this.qdrantDataSource.scroll(collectionName, {
        filter: combinedFilter,
        limit: limit,
        with_payload: true,
        with_vectors: false
      });

      // Map Qdrant results to HybridSearchResult format
      return results.map((result: any) => ({
        id: result.id,
        score: result.score || 0, // Qdrant scroll doesn't return score, default to 0
        payload: result.payload,
        content: result.payload?.content,
        searchType: 'keyword_only'
      })) as HybridSearchResult[];
    } catch (error) {
      throw new Error(`Qdrant keyword search failed: ${(error as Error).message}`);
    }
  }
}