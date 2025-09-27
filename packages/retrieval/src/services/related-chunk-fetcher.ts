/**
 * Related Chunk Fetcher - Retrieves all chunks belonging to detected sections
 */

import { HybridSearchResult } from '../types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';
import { DetectedSection } from './section-detection.js';

export interface RelatedChunkQuery {
  sectionPath: string;
  tenantId: string;
  userContext: UserContext;
  maxChunks: number;
  excludeChunkIds: string[]; // Chunks already retrieved
  documentId?: string; // Add documentId directly to the query interface
}

export interface RelatedChunkResult {
  chunks: HybridSearchResult[];
  completionConfidence: number;
  sectionMetadata: {
    totalParts: number;
    retrievedParts: number;
    missingParts: string[];
    queryPattern: string;
  };
  performance: {
    fetchDuration: number;
    chunksRequested: number;
    chunksReturned: number;
  };
}

export interface RelatedChunkFetcherConfig {
  enabled: boolean;
  maxChunksPerSection: number;    // Maximum chunks to fetch per section
  queryTimeoutMs: number;         // Timeout for individual queries
  preserveOriginalScoring: boolean; // Whether to maintain original relevance scores
}

export class RelatedChunkFetcherService {
  private config: RelatedChunkFetcherConfig;

  constructor(
    private vectorSearchService: any, // VectorSearchService interface
    private qdrantClient: any,         // QdrantClient for direct queries
    config: Partial<RelatedChunkFetcherConfig> = {}
  ) {
    this.config = {
      enabled: true,
      maxChunksPerSection: 10,
      queryTimeoutMs: 2000,
      preserveOriginalScoring: true,
      ...config
    };
  }

  /**
   * Fetch related chunks for all detected sections
   */
  async fetchRelatedChunks(
    detectedSections: DetectedSection[],
    collectionName: string,
    userContext: UserContext,
    excludeChunkIds: string[] = []
  ): Promise<Map<string, RelatedChunkResult>> {
    if (!this.config.enabled || detectedSections.length === 0) {
      return new Map();
    }


    const results = new Map<string, RelatedChunkResult>();
    const fetchPromises = detectedSections.map(section =>
      this.fetchSectionChunks(section, collectionName, userContext, excludeChunkIds)
        .then(result => {
          if (result.chunks.length > 0) {
            results.set(section.sectionPath, result);
          }
          return result;
        })
        .catch(error => {
          console.warn('❌ Failed to fetch chunks for section:', section.sectionPath, error.message);
          return null;
        })
    );

    // Wait for all fetch operations with timeout
    await Promise.allSettled(fetchPromises);

    return results;
  }

  /**
   * Fetch chunks for a single section
   */
  private async fetchSectionChunks(
    section: DetectedSection,
    collectionName: string,
    userContext: UserContext,
    excludeChunkIds: string[]
  ): Promise<RelatedChunkResult> {
    const startTime = performance.now();
    const query: RelatedChunkQuery = {
      sectionPath: section.sectionPath,
      tenantId: userContext.tenantId || 'default',
      userContext, // Pass original user context
      documentId: section.documentId, // Pass documentId as a separate property
      maxChunks: this.config.maxChunksPerSection,
      excludeChunkIds
    };

    try {
      // Create timeout promise with cleanup
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Query timeout')), this.config.queryTimeoutMs);
      });

      // Execute query with timeout
      const queryPromise = this.executeRelatedChunkQuery(collectionName, query);

      try {
        const chunks = await Promise.race([queryPromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId); // Clear timeout if query completes first
        return this.buildSuccessfulResult(chunks, section, startTime, query);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId); // Clear timeout if query fails
        throw error;
      }

    } catch (error) {
      console.warn('Related chunk fetch failed for section:', section.sectionPath, error);

      return {
        chunks: [],
        completionConfidence: 0,
        sectionMetadata: {
          totalParts: 0,
          retrievedParts: 0,
          missingParts: [],
          queryPattern: section.sectionPath
        },
        performance: {
          fetchDuration: performance.now() - startTime,
          chunksRequested: query.maxChunks,
          chunksReturned: 0
        }
      };
    }
  }

  /**
   * Build successful result for section chunk fetch
   */
  private buildSuccessfulResult(
    chunks: HybridSearchResult[],
    section: DetectedSection,
    startTime: number,
    query: RelatedChunkQuery
  ): RelatedChunkResult {
    const fetchDuration = performance.now() - startTime;

    // Analyze completeness
    const sectionMetadata = this.analyzeSectionCompleteness(chunks, section.sectionPath);
    const completionConfidence = this.calculateCompletionConfidence(chunks, section, sectionMetadata);

    return {
      chunks,
      completionConfidence,
      sectionMetadata,
      performance: {
        fetchDuration,
        chunksRequested: query.maxChunks,
        chunksReturned: chunks.length
      }
    };
  }

  /**
   * Execute the actual query for related chunks
   */
  private async executeRelatedChunkQuery(
    collectionName: string,
    query: RelatedChunkQuery
  ): Promise<HybridSearchResult[]> {

    try {
      // Perform sectionPath-based retrieval
      // When calling this.executeSectionPathQuery, ensure the section's documentId is passed through userContext.
      // The query object already contains section.documentId within userContext due to the modification above.
      let chunks = await this.executeSectionPathQuery(collectionName, query);

      return chunks;

    } catch (error) {
      console.error('Failed to execute related chunk query:', error);
      throw error;
    }
  }

  /**
   * Execute the actual query for related chunks based on sectionPath.
   */
  private async executeSectionPathQuery(
    collectionName: string,
    query: RelatedChunkQuery
  ): Promise<HybridSearchResult[]> {
    // Pass the documentId from the query object directly
    const sectionFilter = this.buildSectionPathFilter(query.sectionPath, query.userContext, query.documentId);

    const scrollResult = await this.qdrantClient.scroll(collectionName, {
      filter: sectionFilter,
      limit: query.maxChunks,
      with_payload: true,
      with_vector: false
    });

    return scrollResult.points
      .filter((point: any) => !query.excludeChunkIds.includes(point.id))
      .map((point: any) => ({
        id: point.id,
        score: this.config.preserveOriginalScoring ? (point.payload?.originalScore || 0.8) : 0.8,
        content: point.payload?.content || '',
        payload: point.payload,
        searchType: 'section_related' as const,
        vectorScore: undefined,
        keywordScore: undefined,
        fusionScore: this.config.preserveOriginalScoring ? (point.payload?.originalScore || 0.8) : 0.8
      }));
  }

  /**
   * Build filter for sectionPath prefix matching with RBAC
   */
  private buildSectionPathFilter(sectionPath: string, userContext: UserContext, docId?: string): any {
    const filters: any[] = [
      // Tenant isolation (corrected field name)
      { key: 'tenant', match: { value: userContext.tenantId } },
      // ACL check - user must have access
      {
        should: [
          { key: 'acl', match: { any: userContext.groupIds } },
          { key: 'acl', match: { value: 'public' } }
        ]
      }
    ];

    if (docId) {
      filters.push({ key: 'docId', match: { value: docId } });
    }

    // Filter by sectionPath that contains the base section path
    // This will match both "block_9" and "block_9/part_X" patterns
    filters.push({
      key: 'sectionPath',
      match: { text: sectionPath } // Use text match which acts as contains in Qdrant
    });

    return {
      must: filters
    };
  }

  /**
   * Analyze section completeness based on retrieved chunks
   */
  private analyzeSectionCompleteness(
    chunks: HybridSearchResult[],
    baseSectionPath: string
  ): RelatedChunkResult['sectionMetadata'] {
    const retrievedParts: string[] = [];
    const allParts = new Set<string>();

    // Extract part information from chunks
    for (const chunk of chunks) {
      const sectionPath = chunk.payload?.sectionPath || chunk.payload?.section_path || chunk.id;
      if (sectionPath && typeof sectionPath === 'string') {
        allParts.add(sectionPath);

        // Extract part identifier
        const partMatch = sectionPath.match(/part_(\d+)|_(\d+)$/);
        if (partMatch) {
          const partNum = partMatch[1] || partMatch[2];
          retrievedParts.push(`part_${partNum}`);
        } else if (sectionPath === baseSectionPath) {
          retrievedParts.push('part_0');
        }
      }
    }

    // Estimate total parts based on highest part number found
    const partNumbers = retrievedParts
      .map(part => parseInt(part.replace('part_', '')))
      .filter(num => !isNaN(num));

    const maxPartNum = Math.max(...partNumbers, 0);
    const estimatedTotalParts = maxPartNum + 1;

    // Find missing parts
    const missingParts: string[] = [];
    for (let i = 0; i < estimatedTotalParts; i++) {
      if (!retrievedParts.includes(`part_${i}`)) {
        missingParts.push(`part_${i}`);
      }
    }

    return {
      totalParts: estimatedTotalParts,
      retrievedParts: retrievedParts.length,
      missingParts,
      queryPattern: baseSectionPath
    };
  }

  /**
   * Calculate completion confidence based on retrieved chunks and section metadata
   */
  private calculateCompletionConfidence(
    chunks: HybridSearchResult[],
    section: DetectedSection,
    metadata: RelatedChunkResult['sectionMetadata']
  ): number {
    if (chunks.length === 0) {
      return 0;
    }

    // Base confidence from section detection
    let confidence = section.confidence * 0.4;

    // Boost confidence based on retrieval completeness
    if (metadata.totalParts > 0) {
      const completionRatio = metadata.retrievedParts / metadata.totalParts;
      confidence += completionRatio * 0.4;
    } else {
      // If we found chunks, assume reasonable completion
      confidence += 0.3;
    }

    // Boost confidence based on number of chunks retrieved
    const chunkCountBoost = Math.min(chunks.length / 5, 1) * 0.2;
    confidence += chunkCountBoost;

    // Removed content-specific boosts as per user feedback.

    return Math.min(confidence, 1.0);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RelatedChunkFetcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RelatedChunkFetcherConfig {
    return { ...this.config };
  }
}

/**
 * Factory function for creating related chunk fetcher service
 */
export function createRelatedChunkFetcherService(
  vectorSearchService: any,
  qdrantClient: any,
  config?: Partial<RelatedChunkFetcherConfig>
): RelatedChunkFetcherService {
  return new RelatedChunkFetcherService(vectorSearchService, qdrantClient, config);
}