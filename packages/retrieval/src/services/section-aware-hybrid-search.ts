/**
 * Section-Aware Hybrid Search Service - Enhanced hybrid search with section completion
 */

import { HybridSearchServiceImpl, HybridSearchService } from './hybrid-search.js';
import { SectionDetectionService, createSectionDetectionService } from './section-detection.js';
import { RelatedChunkFetcherService, createRelatedChunkFetcherService } from './related-chunk-fetcher.js';
import { SectionReconstructionEngine, createSectionReconstructionEngine, ReconstructedSection } from './section-reconstruction.js';
import { HybridSearchRequest, HybridSearchResult, StructuredHybridSearchResult } from '../types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';

export interface SectionAwareSearchConfig {
  enabled: boolean;
  maxSectionsToComplete: number;        // Max sections to complete per query
  sectionCompletionTimeoutMs: number;   // Timeout for section completion
  mergeStrategy: 'replace' | 'append' | 'interleave';
  preserveOriginalRanking: boolean;     // Whether to maintain original result order
  minTriggerConfidence: number;         // Minimum confidence to trigger section completion
}

export interface SectionAwareSearchResult extends StructuredHybridSearchResult {
  sectionCompletionMetrics: {
    sectionsDetected: number;
    sectionsCompleted: number;
    sectionsReconstructed: number;
    totalAdditionalChunks: number;
    completionDuration: number;
    timeoutOccurred: boolean;
  };
  reconstructedSections: ReconstructedSection[];
}

export class SectionAwareHybridSearchService extends HybridSearchServiceImpl {
  private sectionDetectionService: SectionDetectionService;
  private relatedChunkFetcher: RelatedChunkFetcherService;
  private sectionReconstructor: SectionReconstructionEngine;
  private sectionConfig: SectionAwareSearchConfig;

  constructor(
    vectorSearchService: any,
    keywordSearchService: any,
    rrfFusionService: any,
    embeddingService: any,
    rerankerService: any,
    qdrantClient: any,
    config: Partial<SectionAwareSearchConfig> = {}
  ) {
    super(vectorSearchService, keywordSearchService, rrfFusionService, embeddingService, rerankerService);

    this.sectionConfig = {
      enabled: true,
      maxSectionsToComplete: 3,
      sectionCompletionTimeoutMs: 3000,
      mergeStrategy: 'append', // Changed to 'append' to ensure original chunks are preserved
      preserveOriginalRanking: false,
      minTriggerConfidence: 0.7,
      ...config
    };

    // Initialize section-aware components
    this.sectionDetectionService = createSectionDetectionService();
    this.relatedChunkFetcher = createRelatedChunkFetcherService(vectorSearchService, qdrantClient);
    this.sectionReconstructor = createSectionReconstructionEngine();

    console.log('🚀 Section-Aware Hybrid Search Service initialized:', {
      enabled: this.sectionConfig.enabled,
      maxSections: this.sectionConfig.maxSectionsToComplete,
      mergeStrategy: this.sectionConfig.mergeStrategy,
      timeout: this.sectionConfig.sectionCompletionTimeoutMs
    });
  }

  /**
   * Enhanced search with section-aware completion
   */
  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<SectionAwareSearchResult> {
    console.log('🔍 Section-aware search started for query:', request.query.substring(0, 50) + '...');

    // First, perform standard hybrid search
    const standardResult = await super.search(collectionName, request, userContext);

    // If section-aware search is disabled, return standard result with empty metrics
    if (!this.sectionConfig.enabled) {
      console.log('⚪ Section-aware search disabled, returning standard results');
      return this.createSectionAwareResult(standardResult, [], {
        sectionsDetected: 0,
        sectionsCompleted: 0,
        sectionsReconstructed: 0,
        totalAdditionalChunks: 0,
        completionDuration: 0,
        timeoutOccurred: false
      });
    }

    const sectionStartTime = performance.now();
    let timeoutOccurred = false;

    try {
      // Set up timeout for section completion
      const sectionPromise = this.performSectionCompletion(
        standardResult.finalResults,
        collectionName,
        userContext,
        request.query
      );

      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => {
          timeoutOccurred = true;
          reject(new Error('Section completion timeout'));
        }, this.sectionConfig.sectionCompletionTimeoutMs);
      });

      const sectionResult = await Promise.race([sectionPromise, timeoutPromise]);
      const completionDuration = performance.now() - sectionStartTime;

      console.log('✅ Section completion successful:', {
        sectionsDetected: sectionResult.sectionsDetected,
        sectionsCompleted: sectionResult.sectionsCompleted,
        sectionsReconstructed: sectionResult.reconstructedSections.length,
        duration: Math.round(completionDuration)
      });

      // Merge results with enhanced sections
      const enhancedResults = this.mergeResultsWithSections(
        standardResult.finalResults,
        sectionResult.reconstructedSections
      );

      return this.createSectionAwareResult(
        {
          ...standardResult,
          finalResults: enhancedResults
        },
        sectionResult.reconstructedSections,
        {
          sectionsDetected: sectionResult.sectionsDetected,
          sectionsCompleted: sectionResult.sectionsCompleted,
          sectionsReconstructed: sectionResult.reconstructedSections.length,
          totalAdditionalChunks: sectionResult.totalAdditionalChunks,
          completionDuration,
          timeoutOccurred
        }
      );

    } catch (error) {
      // On timeout or error, return standard results
      console.warn('⚠️ Section completion failed, falling back to standard results:', error);

      return this.createSectionAwareResult(standardResult, [], {
        sectionsDetected: 0,
        sectionsCompleted: 0,
        sectionsReconstructed: 0,
        totalAdditionalChunks: 0,
        completionDuration: performance.now() - sectionStartTime,
        timeoutOccurred
      });
    }
  }

  /**
   * Perform section completion process
   */
  private async performSectionCompletion(
    results: HybridSearchResult[],
    collectionName: string,
    userContext: UserContext,
    query?: string
  ): Promise<{
    sectionsDetected: number;
    sectionsCompleted: number;
    reconstructedSections: ReconstructedSection[];
    totalAdditionalChunks: number;
  }> {
    console.log('🔎 Starting section completion for', results.length, 'initial results');

    // Step 1: Detect sections
    const detectedSections = this.sectionDetectionService.detectSections(results, userContext);
    console.log('📝 Detected sections:', JSON.stringify(detectedSections, null, 2)); // Added log

    if (detectedSections.length === 0) {
      console.log('📝 No sections detected for completion');
      return {
        sectionsDetected: 0,
        sectionsCompleted: 0,
        reconstructedSections: [],
        totalAdditionalChunks: 0
      };
    }

    console.log('🎯 Detected', detectedSections.length, 'sections for potential completion');

    // Limit sections to process based on configuration, prioritizing query-relevant sections
    const sectionsToProcess = detectedSections
      .filter(section => section.confidence >= this.sectionConfig.minTriggerConfidence)
      .map(section => ({
        ...section,
        queryRelevance: query ? this.calculateQueryRelevance(section, query) : 0
      }))
      .sort((a, b) => {
        // Sort by query relevance first, then by confidence
        if (a.queryRelevance !== b.queryRelevance) {
          return b.queryRelevance - a.queryRelevance;
        }
        return b.confidence - a.confidence;
      })
      .slice(0, this.sectionConfig.maxSectionsToComplete);

    console.log('🔧 Processing', sectionsToProcess.length, 'sections (filtered by confidence and limit)');

    if (sectionsToProcess.length === 0) {
      return {
        sectionsDetected: detectedSections.length,
        sectionsCompleted: 0,
        reconstructedSections: [],
        totalAdditionalChunks: 0
      };
    }

    // Step 2: Fetch related chunks
    const existingChunkIds = results.map(r => r.id);
    console.log('📥 Fetching related chunks, excluding', existingChunkIds.length, 'existing chunks');

    const relatedChunkResults = await this.relatedChunkFetcher.fetchRelatedChunks(
      sectionsToProcess,
      collectionName,
      userContext,
      existingChunkIds
    );

    console.log('📊 Related chunk fetch results:', relatedChunkResults.size, 'sections had related chunks');
    console.log('Fetched related chunks for reconstruction:', JSON.stringify(Array.from(relatedChunkResults.entries()), null, 2)); // Added log

    // Step 3: Reconstruct sections
    const reconstructedSections = this.sectionReconstructor.reconstructSections(
      sectionsToProcess,
      relatedChunkResults
    );

    // Calculate metrics
    const totalAdditionalChunks = Array.from(relatedChunkResults.values())
      .reduce((sum, result) => sum + result.chunks.length, 0);

    console.log('🎉 Section completion summary:', {
      sectionsDetected: detectedSections.length,
      sectionsCompleted: relatedChunkResults.size,
      sectionsReconstructed: reconstructedSections.length,
      totalAdditionalChunks
    });

    return {
      sectionsDetected: detectedSections.length,
      sectionsCompleted: relatedChunkResults.size,
      reconstructedSections,
      totalAdditionalChunks
    };
  }

  /**
   * Merge original results with reconstructed sections
   */
  private mergeResultsWithSections(
    originalResults: HybridSearchResult[],
    reconstructedSections: ReconstructedSection[]
  ): HybridSearchResult[] {
    if (reconstructedSections.length === 0) {
      console.log('📋 No reconstructed sections to merge, returning original results');
      return originalResults;
    }

    console.log('🔀 Merging', originalResults.length, 'original results with', reconstructedSections.length, 'reconstructed sections using strategy:', this.sectionConfig.mergeStrategy);

    switch (this.sectionConfig.mergeStrategy) {
      case 'replace':
        return this.replaceWithSections(originalResults, reconstructedSections);
      case 'append':
        return this.appendSections(originalResults, reconstructedSections);
      case 'interleave':
        return this.interleaveSections(originalResults, reconstructedSections);
      default:
        return originalResults;
    }
  }

  /**
   * Replace original chunks with reconstructed sections
   */
  private replaceWithSections(
    originalResults: HybridSearchResult[],
    reconstructedSections: ReconstructedSection[]
  ): HybridSearchResult[] {
    const replacedIds = new Set<string>();

    // Mark chunks that are part of reconstructed sections
    for (const section of reconstructedSections) {
      for (const chunkRef of section.originalChunks) {
        replacedIds.add(chunkRef.chunkId);
      }
    }

    console.log('🔄 Replace strategy: replacing', replacedIds.size, 'original chunks with', reconstructedSections.length, 'sections');

    // Filter out replaced chunks and add reconstructed sections
    const filteredResults = originalResults.filter(result => !replacedIds.has(result.id));
    const sectionResults = reconstructedSections.map(section => this.convertSectionToResult(section));

    return [...sectionResults, ...filteredResults];
  }

  /**
   * Append sections to original results
   */
  private appendSections(
    originalResults: HybridSearchResult[],
    reconstructedSections: ReconstructedSection[]
  ): HybridSearchResult[] {
    console.log('➕ Append strategy: appending', reconstructedSections.length, 'sections to', originalResults.length, 'original results');

    const sectionResults = reconstructedSections.map(section => this.convertSectionToResult(section));
    return [...originalResults, ...sectionResults];
  }

  /**
   * Interleave sections with original results based on relevance
   */
  private interleaveSections(
    originalResults: HybridSearchResult[],
    reconstructedSections: ReconstructedSection[]
  ): HybridSearchResult[] {
    console.log('🔀 Interleave strategy: merging', originalResults.length, 'original results with', reconstructedSections.length, 'sections by relevance');

    const sectionResults = reconstructedSections.map(section => this.convertSectionToResult(section));

    // Combine and sort by score
    const allResults = [...originalResults, ...sectionResults];
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Remove duplicates (chunks that were reconstructed into sections)
    const seenChunks = new Set<string>();
    const finalResults: HybridSearchResult[] = [];

    for (const result of allResults) {
      if (result.searchType === 'section_reconstructed') {
        // For sections, mark all original chunks as seen
        const section = reconstructedSections.find(s => s.id === result.id);
        if (section) {
          section.originalChunks.forEach(chunk => seenChunks.add(chunk.chunkId));
          finalResults.push(result);
        }
      } else if (!seenChunks.has(result.id)) {
        finalResults.push(result);
      }
    }

    console.log('✅ Interleave complete:', finalResults.length, 'final results after deduplication');
    return finalResults;
  }

  /**
   * Convert ReconstructedSection to HybridSearchResult
   */
  private convertSectionToResult(section: ReconstructedSection): HybridSearchResult {
    return {
      id: section.id,
      score: section.combinedScore,
      content: section.content,
      payload: section.payload,
      searchType: section.searchType,
      vectorScore: section.vectorScore,
      keywordScore: section.keywordScore,
      fusionScore: section.fusionScore,
      rank: 0 // Will be set during final ranking
    };
  }

  /**
   * Create section-aware result wrapper
   */
  private createSectionAwareResult(
    standardResult: StructuredHybridSearchResult,
    reconstructedSections: ReconstructedSection[],
    metrics: SectionAwareSearchResult['sectionCompletionMetrics']
  ): SectionAwareSearchResult {
    return {
      ...standardResult,
      sectionCompletionMetrics: metrics,
      reconstructedSections
    };
  }

  /**
   * Update section-aware configuration
   */
  updateSectionConfig(config: Partial<SectionAwareSearchConfig>): void {
    this.sectionConfig = { ...this.sectionConfig, ...config };
    console.log('⚙️ Section-aware config updated:', this.sectionConfig);
  }

  /**
   * Calculate query relevance for a section
   */
  private calculateQueryRelevance(section: any, query: string): number {
    // Domainless: no hardcoded relevance calculation
    return 0;
  }

  /**
   * Get section-aware configuration
   */
  getSectionConfig(): SectionAwareSearchConfig {
    return { ...this.sectionConfig };
  }
}

/**
 * Factory function for creating section-aware hybrid search service
 */
export function createSectionAwareHybridSearchService(
  vectorSearchService: any,
  keywordSearchService: any,
  rrfFusionService: any,
  embeddingService: any,
  rerankerService: any,
  qdrantClient: any,
  config?: Partial<SectionAwareSearchConfig>
): SectionAwareHybridSearchService {
  return new SectionAwareHybridSearchService(
    vectorSearchService,
    keywordSearchService,
    rrfFusionService,
    embeddingService,
    rerankerService,
    qdrantClient,
    config
  );
}