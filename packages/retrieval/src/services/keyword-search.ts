import { KeywordSearchResult } from '../types/hybrid.js';

export interface KeywordSearchService {
  search(
    collectionName: string,
    query: string,
    limit: number,
    filter?: Record<string, any>
  ): Promise<KeywordSearchResult[]>;
}

// Qdrant client interface to avoid direct dependency
interface QdrantClientInterface {
  scroll(collectionName: string, params: any): Promise<any>;
  discover(collectionName: string, params: any): Promise<any>;
}

export class QdrantKeywordSearchService implements KeywordSearchService {
  constructor(private qdrantClient: QdrantClientInterface) {}

  async search(
    collectionName: string,
    query: string,
    limit: number,
    filter?: Record<string, any>
  ): Promise<KeywordSearchResult[]> {
    try {
      // Use Qdrant's scroll with proper keyword search
      // Break query into individual terms and search for any of them
      const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
      console.log('Query terms for keyword search:', queryTerms);

      const searchFilter: any = {
        should: queryTerms.map(term => ({
          key: 'content',
          match: {
            text: term
          }
        })),
        must: []
      };

      // Add additional filters if provided (RBAC filters)
      if (filter && Object.keys(filter).length > 0) {
        this.mergeFilterConditions(searchFilter, filter);
      }

      console.log('Keyword search - filter:', JSON.stringify(searchFilter, null, 2));
      console.log('Keyword search - query:', query);
      console.log('Keyword search - limit:', limit);

      const scrollResult = await this.qdrantClient.scroll(collectionName, {
        filter: searchFilter,
        limit: limit,
        with_payload: true,
        with_vector: false // We don't need vectors for keyword search
      });

      console.log('Keyword search scroll results count:', scrollResult.points?.length || 0);

      const results = scrollResult.points.map((point: any) => ({
        id: point.id.toString(),
        score: this.calculateBM25Score(query, point.payload?.content || ''),
        payload: point.payload || {},
        content: point.payload?.content || ''
      }))
      .sort((a: KeywordSearchResult, b: KeywordSearchResult) => b.score - a.score) // Sort by BM25 score descending
      .slice(0, limit);

      console.log('Keyword search final results count:', results.length);
      results.forEach((result: any, i: number) => {
        const content = result.content;
        const contentPreview = typeof content === 'string' ? content.substring(0, 100) : String(content || '').substring(0, 100);
        console.log(`Keyword Result ${i + 1}: score=${result.score}, docId=${result.payload?.docId}, content preview=${contentPreview}...`);
      });

      return results;

    } catch (error) {
      console.error('Keyword search failed:', error);
      throw new Error(`Keyword search failed: ${(error as Error).message}`);
    }
  }

  private mergeFilterConditions(baseFilter: any, additionalFilter: Record<string, any>): void {
    // If the additional filter has a complex structure (RBAC filter), merge properly
    if (additionalFilter.must && Array.isArray(additionalFilter.must)) {
      // Merge must conditions
      baseFilter.must.push(...additionalFilter.must);
    }

    if (additionalFilter.should && Array.isArray(additionalFilter.should)) {
      // Add should conditions (for language preferences, etc.)
      if (!baseFilter.should) {
        baseFilter.should = [];
      }
      baseFilter.should.push(...additionalFilter.should);
    }

    // Handle simple key-value filters
    for (const [key, value] of Object.entries(additionalFilter)) {
      if (key !== 'must' && key !== 'should') {
        if (Array.isArray(value)) {
          baseFilter.must.push({
            key,
            match: { any: value }
          });
        } else {
          baseFilter.must.push({
            key,
            match: { value }
          });
        }
      }
    }
  }

  private buildFilterConditions(filter: Record<string, any>): any[] {
    const conditions: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (Array.isArray(value)) {
        conditions.push({
          key,
          match: { any: value }
        });
      } else {
        conditions.push({
          key,
          match: { value }
        });
      }
    }

    return conditions;
  }

  private calculateBM25Score(query: string, content: string): number {
    // Simple BM25-inspired scoring implementation
    // In a production system, you'd want to use Qdrant's built-in BM25 scoring
    const k1 = 1.2;
    const b = 0.75;
    const avgDocLength = 1000; // Average document length assumption

    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    const docLength = content.length;

    let score = 0;

    for (const term of queryTerms) {
      const tf = (contentLower.match(new RegExp(term, 'g')) || []).length;
      if (tf > 0) {
        const normalizedTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
        // Simplified IDF calculation (in real BM25, this would use document frequency)
        const idf = Math.log(1 + 1 / (tf + 1));
        score += normalizedTf * idf;
      }
    }

    return score;
  }
}

// Alternative implementation using Qdrant's discover API for semantic keyword search
export class QdrantSemanticKeywordSearchService implements KeywordSearchService {
  constructor(private qdrantClient: QdrantClientInterface) {}

  async search(
    collectionName: string,
    query: string,
    limit: number,
    filter?: Record<string, any>
  ): Promise<KeywordSearchResult[]> {
    try {
      // Use Qdrant's discover API for semantic search with text queries
      // This is more advanced than simple BM25 but still keyword-based
      if (!this.qdrantClient.discover) {
        throw new Error('Discover method not available on Qdrant client');
      }

      const discoverResult = await this.qdrantClient.discover(collectionName, {
        target: query,
        limit: limit,
        filter: filter,
        with_payload: true,
        with_vector: false
      });

      return discoverResult.map((point: any) => ({
        id: point.id.toString(),
        score: point.score || 0,
        payload: point.payload || {},
        content: point.payload?.content || ''
      }));

    } catch (error) {
      console.error('Semantic keyword search failed:', error);
      throw new Error(`Semantic keyword search failed: ${(error as Error).message}`);
    }
  }
}