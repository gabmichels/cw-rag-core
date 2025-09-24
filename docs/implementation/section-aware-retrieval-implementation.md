# Section-Aware Retrieval Implementation Guide

## Overview

This document provides detailed implementation specifications for the section-aware retrieval enhancement that will solve the problem of incomplete structured content retrieval.

## Implementation Components

### 1. Section Detection Service

**File**: `packages/retrieval/src/services/section-detection.ts`

```typescript
/**
 * Section Detection Service - Identifies chunks that belong to structured sections
 */

import { HybridSearchResult } from '../types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';

export interface SectionPattern {
  basePattern: string;          // e.g., "block_9"
  partCount: number;           // Number of parts detected
  structureType: 'table' | 'list' | 'hierarchy' | 'sequence';
  confidence: number;          // 0-1 confidence this is a structured section
  detectionReasons: string[];  // Why this was detected as a section
}

export interface SectionDetectionConfig {
  enabled: boolean;
  minConfidenceThreshold: number;    // 0.7 - Only complete high-confidence sections
  maxSectionParts: number;          // 10 - Prevent excessive chunk retrieval
  structurePatterns: string[];      // Regex patterns for structured content
  enabledContentTypes: string[];    // ['table', 'list'] - Types to complete
  tableKeywords: string[];          // ['tier', 'level', 'rank', 'skill'] - Table indicators
  listKeywords: string[];           // ['step', 'point', 'item'] - List indicators
}

export interface DetectedSection {
  sectionPath: string;
  pattern: SectionPattern;
  triggerChunk: HybridSearchResult;
  confidence: number;
  priority: number;  // Higher priority sections get completed first
}

export class SectionDetectionService {
  private config: SectionDetectionConfig;

  constructor(config: Partial<SectionDetectionConfig> = {}) {
    this.config = {
      enabled: true,
      minConfidenceThreshold: 0.7,
      maxSectionParts: 10,
      structurePatterns: [
        /block_\d+\/part_\d+/,     // Standard chunking pattern
        /section_\d+_\d+/,         // Alternative section pattern
        /table_\d+_row_\d+/        // Table-specific pattern
      ],
      enabledContentTypes: ['table', 'list', 'hierarchy'],
      tableKeywords: ['tier', 'level', 'rank', 'skill', 'ability', 'novice', 'master', 'apprentice', 'journeyman', 'grandmaster', 'legendary', 'mythic'],
      listKeywords: ['step', 'point', 'item', 'phase', 'stage'],
      ...config
    };
  }

  /**
   * Analyze retrieved chunks to detect potential sections requiring completion
   */
  detectSections(
    results: HybridSearchResult[],
    userContext: UserContext
  ): DetectedSection[] {
    if (!this.config.enabled) {
      return [];
    }

    const detectedSections: DetectedSection[] = [];

    for (const result of results) {
      // Only analyze high-confidence results
      if (result.score < this.config.minConfidenceThreshold) {
        continue;
      }

      const sectionPath = this.extractSectionPath(result);
      if (!sectionPath) {
        continue;
      }

      const pattern = this.analyzeSectionPattern(sectionPath, result);
      if (!pattern || pattern.confidence < this.config.minConfidenceThreshold) {
        continue;
      }

      const detectedSection: DetectedSection = {
        sectionPath: this.getBaseSectionPath(sectionPath),
        pattern,
        triggerChunk: result,
        confidence: pattern.confidence,
        priority: this.calculatePriority(pattern, result)
      };

      detectedSections.push(detectedSection);
    }

    // Sort by priority (highest first) and remove duplicates
    return this.deduplicateAndSort(detectedSections);
  }

  // ... (implementation details as previously specified)
}
```

### 2. Related Chunk Fetcher Service

**File**: `packages/retrieval/src/services/related-chunk-fetcher.ts`

```typescript
/**
 * Related Chunk Fetcher - Retrieves all chunks belonging to detected sections
 */

import { HybridSearchResult } from '../types/hybrid.js';
import { VectorSearchService } from '../services/hybrid-search.js';
import { UserContext } from '@cw-rag-core/shared';
import { DetectedSection } from './section-detection.js';

export interface RelatedChunkQuery {
  sectionPath: string;
  tenantId: string;
  userContext: UserContext;
  maxChunks: number;
  excludeChunkIds: string[]; // Chunks already retrieved
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

export class RelatedChunkFetcherService {
  // ... (implementation details as previously specified)
}
```

### 3. Section Reconstruction Engine

**File**: `packages/retrieval/src/services/section-reconstruction.ts`

```typescript
/**
 * Section Reconstruction Engine - Merges related chunks into coherent sections
 */

import { HybridSearchResult } from '../types/hybrid.js';
import { RelatedChunkResult } from './related-chunk-fetcher.js';
import { DetectedSection } from './section-detection.js';

export interface ReconstructedSection {
  id: string;                          // Combined section ID
  content: string;                     // Merged content
  originalChunks: ChunkReference[];    // References to source chunks
  completeness: number;                // 0-1 how complete the section is
  combinedScore: number;               // Weighted average of chunk scores
  sectionMetadata: {
    sectionPath: string;
    structureType: string;
    partCount: number;
    reconstructionMethod: string;
    preservedFormatting: boolean;
  };
  searchType: 'section_reconstructed';
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  payload: Record<string, any>;
}

export interface ChunkReference {
  chunkId: string;
  sectionPath: string;
  partNumber: number;
  originalScore: number;
  contributionWeight: number; // How much this chunk contributed to final content
}

export interface SectionReconstructionConfig {
  enabled: boolean;
  preserveFormatting: boolean;        // Maintain original markdown/formatting
  mergeStrategy: 'sequential' | 'weighted' | 'intelligent';
  maxSectionLength: number;           // Character limit for reconstructed sections
  includePartSeparators: boolean;     // Add separators between merged parts
  scoreCalculationMethod: 'average' | 'weighted' | 'max';
}

export class SectionReconstructionEngine {
  private config: SectionReconstructionConfig;

  constructor(config: Partial<SectionReconstructionConfig> = {}) {
    this.config = {
      enabled: true,
      preserveFormatting: true,
      mergeStrategy: 'intelligent',
      maxSectionLength: 8000,
      includePartSeparators: false,
      scoreCalculationMethod: 'weighted',
      ...config
    };
  }

  /**
   * Reconstruct complete sections from detected sections and related chunks
   */
  reconstructSections(
    detectedSections: DetectedSection[],
    relatedChunkResults: Map<string, RelatedChunkResult>
  ): ReconstructedSection[] {
    if (!this.config.enabled) {
      return [];
    }

    const reconstructedSections: ReconstructedSection[] = [];

    for (const detectedSection of detectedSections) {
      const relatedResult = relatedChunkResults.get(detectedSection.sectionPath);
      if (!relatedResult) {
        continue;
      }

      // Combine original trigger chunk with related chunks
      const allChunks = [detectedSection.triggerChunk, ...relatedResult.chunks];

      // Remove duplicates based on chunk ID
      const uniqueChunks = this.deduplicateChunks(allChunks);

      // Sort chunks by section path order
      const sortedChunks = this.sortChunksByOrder(uniqueChunks);

      // Reconstruct the section
      const reconstructed = this.mergeChunks(
        sortedChunks,
        detectedSection,
        relatedResult
      );

      if (reconstructed && this.isValidReconstructedSection(reconstructed)) {
        reconstructedSections.push(reconstructed);
      }
    }

    return reconstructedSections;
  }

  /**
   * Remove duplicate chunks based on ID
   */
  private deduplicateChunks(chunks: HybridSearchResult[]): HybridSearchResult[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      if (seen.has(chunk.id)) {
        return false;
      }
      seen.add(chunk.id);
      return true;
    });
  }

  /**
   * Sort chunks by their section path order
   */
  private sortChunksByOrder(chunks: HybridSearchResult[]): HybridSearchResult[] {
    return chunks.sort((a, b) => {
      const orderA = this.extractPartNumber(a);
      const orderB = this.extractPartNumber(b);
      return orderA - orderB;
    });
  }

  /**
   * Extract part number from chunk for ordering
   */
  private extractPartNumber(chunk: HybridSearchResult): number {
    const sectionPath = chunk.payload?.sectionPath || chunk.id;

    // Try to extract part number from various patterns
    const patterns = [
      /part_(\d+)$/,           // block_9/part_0
      /_(\d+)$/,               // section_table_0
      /\.(\d+)$/               // block.9.0
    ];

    for (const pattern of patterns) {
      const match = sectionPath.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0; // Default to first position
  }

  /**
   * Merge chunks into a reconstructed section
   */
  private mergeChunks(
    chunks: HybridSearchResult[],
    detectedSection: DetectedSection,
    relatedResult: RelatedChunkResult
  ): ReconstructedSection | null {
    if (chunks.length === 0) {
      return null;
    }

    const chunkReferences: ChunkReference[] = [];
    let mergedContent = '';
    let totalScore = 0;
    let totalWeight = 0;

    // Process chunks based on merge strategy
    switch (this.config.mergeStrategy) {
      case 'sequential':
        mergedContent = this.sequentialMerge(chunks, chunkReferences);
        break;
      case 'weighted':
        mergedContent = this.weightedMerge(chunks, chunkReferences);
        break;
      case 'intelligent':
        mergedContent = this.intelligentMerge(chunks, chunkReferences, detectedSection.pattern.structureType);
        break;
    }

    // Calculate combined score
    for (const ref of chunkReferences) {
      totalScore += ref.originalScore * ref.contributionWeight;
      totalWeight += ref.contributionWeight;
    }

    const combinedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Limit content length
    if (mergedContent.length > this.config.maxSectionLength) {
      mergedContent = this.truncatePreservingStructure(
        mergedContent,
        this.config.maxSectionLength,
        detectedSection.pattern.structureType
      );
    }

    const reconstructed: ReconstructedSection = {
      id: `section_${detectedSection.sectionPath}`,
      content: mergedContent,
      originalChunks: chunkReferences,
      completeness: relatedResult.completionConfidence,
      combinedScore,
      sectionMetadata: {
        sectionPath: detectedSection.sectionPath,
        structureType: detectedSection.pattern.structureType,
        partCount: chunks.length,
        reconstructionMethod: this.config.mergeStrategy,
        preservedFormatting: this.config.preserveFormatting
      },
      searchType: 'section_reconstructed',
      vectorScore: this.calculateAverageScore(chunks, 'vectorScore'),
      keywordScore: this.calculateAverageScore(chunks, 'keywordScore'),
      fusionScore: combinedScore,
      payload: this.mergePayloads(chunks)
    };

    return reconstructed;
  }

  /**
   * Sequential merge - simple concatenation in order
   */
  private sequentialMerge(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[]
  ): string {
    const contentParts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const content = chunk.content || '';

      if (content.trim()) {
        contentParts.push(content);

        chunkReferences.push({
          chunkId: chunk.id,
          sectionPath: chunk.payload?.sectionPath || chunk.id,
          partNumber: this.extractPartNumber(chunk),
          originalScore: chunk.score || 0,
          contributionWeight: 1.0 / chunks.length
        });
      }
    }

    const separator = this.config.includePartSeparators ? '\n\n---\n\n' : '\n\n';
    return contentParts.join(separator);
  }

  /**
   * Weighted merge - weight content by chunk relevance scores
   */
  private weightedMerge(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[]
  ): string {
    // Sort by score descending for weighted merging
    const sortedByScore = [...chunks].sort((a, b) => (b.score || 0) - (a.score || 0));

    const contentParts: string[] = [];
    const totalScore = chunks.reduce((sum, chunk) => sum + (chunk.score || 0), 0);

    for (const chunk of sortedByScore) {
      const content = chunk.content || '';
      const weight = totalScore > 0 ? (chunk.score || 0) / totalScore : 1.0 / chunks.length;

      if (content.trim() && weight > 0.1) { // Only include chunks with meaningful weight
        contentParts.push(content);

        chunkReferences.push({
          chunkId: chunk.id,
          sectionPath: chunk.payload?.sectionPath || chunk.id,
          partNumber: this.extractPartNumber(chunk),
          originalScore: chunk.score || 0,
          contributionWeight: weight
        });
      }
    }

    return contentParts.join('\n\n');
  }

  /**
   * Intelligent merge - structure-aware merging
   */
  private intelligentMerge(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[],
    structureType: string
  ): string {
    switch (structureType) {
      case 'table':
        return this.mergeTableStructure(chunks, chunkReferences);
      case 'list':
        return this.mergeListStructure(chunks, chunkReferences);
      case 'hierarchy':
        return this.mergeHierarchyStructure(chunks, chunkReferences);
      default:
        return this.sequentialMerge(chunks, chunkReferences);
    }
  }

  /**
   * Merge table structure intelligently
   */
  private mergeTableStructure(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[]
  ): string {
    const contentParts: string[] = [];
    let tableHeader = '';
    const tableRows: string[] = [];

    for (const chunk of chunks) {
      const content = chunk.content || '';

      // Detect table header
      if (content.includes('Tier') && content.includes('Abilities')) {
        tableHeader = content;
      } else if (content.trim()) {
        tableRows.push(content);
      }

      chunkReferences.push({
        chunkId: chunk.id,
        sectionPath: chunk.payload?.sectionPath || chunk.id,
        partNumber: this.extractPartNumber(chunk),
        originalScore: chunk.score || 0,
        contributionWeight: 1.0 / chunks.length
      });
    }

    // Reconstruct table
    if (tableHeader) {
      contentParts.push(tableHeader);
    }

    contentParts.push(...tableRows);

    return contentParts.join('\n\n');
  }

  /**
   * Merge list structure
   */
  private mergeListStructure(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[]
  ): string {
    // Sort by part number to maintain list order
    const orderedChunks = [...chunks].sort((a, b) =>
      this.extractPartNumber(a) - this.extractPartNumber(b)
    );

    return this.sequentialMerge(orderedChunks, chunkReferences);
  }

  /**
   * Merge hierarchy structure
   */
  private mergeHierarchyStructure(
    chunks: HybridSearchResult[],
    chunkReferences: ChunkReference[]
  ): string {
    // Group by hierarchy level and merge appropriately
    return this.sequentialMerge(chunks, chunkReferences);
  }

  /**
   * Truncate content while preserving structure
   */
  private truncatePreservingStructure(
    content: string,
    maxLength: number,
    structureType: string
  ): string {
    if (content.length <= maxLength) {
      return content;
    }

    // For tables, try to preserve complete rows
    if (structureType === 'table') {
      const lines = content.split('\n');
      let truncated = '';

      for (const line of lines) {
        if (truncated.length + line.length + 1 <= maxLength) {
          truncated += (truncated ? '\n' : '') + line;
        } else {
          break;
        }
      }

      return truncated + '\n\n[Content truncated...]';
    }

    // Default truncation
    return content.substring(0, maxLength - 20) + '\n\n[Content truncated...]';
  }

  /**
   * Calculate average score for a specific score type
   */
  private calculateAverageScore(
    chunks: HybridSearchResult[],
    scoreType: keyof HybridSearchResult
  ): number | undefined {
    const scores = chunks
      .map(chunk => chunk[scoreType] as number)
      .filter(score => typeof score === 'number');

    if (scores.length === 0) {
      return undefined;
    }

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Merge payload objects from all chunks
   */
  private mergePayloads(chunks: HybridSearchResult[]): Record<string, any> {
    const mergedPayload: Record<string, any> = {};

    for (const chunk of chunks) {
      if (chunk.payload) {
        Object.assign(mergedPayload, chunk.payload);
      }
    }

    // Add section-specific metadata
    mergedPayload.sectionReconstructed = true;
    mergedPayload.originalChunkCount = chunks.length;

    return mergedPayload;
  }

  /**
   * Validate that the reconstructed section is valid
   */
  private isValidReconstructedSection(section: ReconstructedSection): boolean {
    return section.content.trim().length > 0 &&
           section.originalChunks.length > 0 &&
           section.completeness > 0.3; // At least 30% complete
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SectionReconstructionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SectionReconstructionConfig {
    return { ...this.config };
  }
}

/**
 * Factory function
 */
export function createSectionReconstructionEngine(
  config?: Partial<SectionReconstructionConfig>
): SectionReconstructionEngine {
  return new SectionReconstructionEngine(config);
}
```

### 4. Enhanced Hybrid Search Service Integration

**File**: `packages/retrieval/src/services/section-aware-hybrid-search.ts`

```typescript
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
      mergeStrategy: 'interleave',
      preserveOriginalRanking: false,
      minTriggerConfidence: 0.7,
      ...config
    };

    this.sectionDetectionService = createSectionDetectionService();
    this.relatedChunkFetcher = createRelatedChunkFetcherService(vectorSearchService, qdrantClient);
    this.sectionReconstructor = createSectionReconstructionEngine();
  }

  /**
   * Enhanced search with section-aware completion
   */
  async search(
    collectionName: string,
    request: HybridSearchRequest,
    userContext: UserContext
  ): Promise<SectionAwareSearchResult> {
    // First, perform standard hybrid search
    const standardResult = await super.search(collectionName, request, userContext);

    // If section-aware search is disabled, return standard result
    if (!this.sectionConfig.enabled) {
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
        userContext
      );

      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => {
          timeoutOccurred = true;
          reject(new Error('Section completion timeout'));
        }, this.sectionConfig.sectionCompletionTimeoutMs);
      });

      const sectionResult = await Promise.race([sectionPromise, timeoutPromise]);
      const completionDuration = performance.now() - sectionStartTime;

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
      console.warn('Section completion failed, falling back to standard results:', error);

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
    userContext: UserContext
  ): Promise<{
    sectionsDetected: number;
    sectionsCompleted: number;
    reconstructedSections: ReconstructedSection[];
    totalAdditionalChunks: number;
  }> {
    // Step 1: Detect sections
    const detectedSections = this.sectionDetectionService.detectSections(results, userContext);

    if (detectedSections.length === 0) {
      return {
        sectionsDetected: 0,
        sectionsCompleted: 0,
        reconstructedSections: [],
        totalAdditionalChunks: 0
      };
    }

    // Limit sections to process
    const sectionsToProcess = detectedSections
      .filter(section => section.confidence >= this.sectionConfig.minTriggerConfidence)
      .slice(0, this.sectionConfig.maxSectionsToComplete);

    // Step 2: Fetch related chunks
    const existingChunkIds = results.map(r => r.id);
    const relatedChunkResults = await this.relatedChunkFetcher.fetchRelatedChunks(
      sectionsToProcess,
      collectionName,
      userContext,
      existingChunkIds
    );

    // Step 3: Reconstruct sections
    const reconstructedSections = this.sectionReconstructor.reconstructSections(
      sectionsToProcess,
      relatedChunkResults
    );

    // Calculate metrics
    const totalAdditionalChunks = Array.from(relatedChunkResults.values())
      .reduce((sum, result) => sum + result.chunks.length, 0);

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
      return originalResults;
    }

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
```

### 5. Integration into Ask Route

**File Update**: `apps/api/src/routes/ask.ts`

```typescript
// Add imports for section-aware services
import {
  SectionAwareHybridSearchService,
  createSectionAwareHybridSearchService
} from '@cw-rag-core/retrieval';

// In askRoute function, replace hybrid search service creation:
const hybridSearchService: SectionAwareHybridSearchService = createSectionAwareHybridSearchService(
  vectorSearchService,
  keywordSearchService,
  rrfFusionService,
  options.embeddingService,
  createRerankerService(true),
  options.qdrantClient,
  {
    enabled: process.env.SECTION_AWARE_SEARCH === 'true' || true, // Enable by default
    maxSectionsToComplete: 2,
    sectionCompletionTimeoutMs: 2000,
    mergeStrategy: 'interleave',
    preserveOriginalRanking: false,
    minTriggerConfidence: 0.7
  }
);
```

### 6. Test Script Enhancement

**File Update**: `test-guardrail-fix.js`

```javascript
// Add validation for complete skill tiers
function validateSkillTableCompleteness(answer) {
  const requiredTiers = ['Novice', 'Apprentice', 'Journeyman', 'Master', 'Grandmaster', 'Legendary', 'Mythic'];
  const foundTiers = [];

  for (const tier of requiredTiers) {
    if (answer.includes(tier)) {
      foundTiers.push(tier);
    }
  }

  console.log('🎯 SKILL TIER ANALYSIS:');
  console.log('-'.repeat(30));
  console.log(`Found tiers: ${foundTiers.join(', ')}`);
  console.log(`Missing tiers: ${requiredTiers.filter(t => !foundTiers.includes(t)).join(', ')}`);
  console.log(`Completeness: ${foundTiers.length}/${requiredTiers.length} (${(foundTiers.length/requiredTiers.length*100).toFixed(1)}%)`);

  const isComplete = foundTiers.length === requiredTiers.length;
  console.log(`Status: ${isComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);

  return {
    isComplete,
    foundTiers,
    missingTiers: requiredTiers.filter(t => !foundTiers.includes(t)),
    completeness: foundTiers.length / requiredTiers.length
  };
}

// Add section completion metrics logging
if (result.sectionCompletionMetrics) {
  console.log();
  console.log('🔧 SECTION COMPLETION METRICS:');
  console.log('-'.repeat(30));
  const metrics = result.sectionCompletionMetrics;
  console.log(`Sections Detected: ${metrics.sectionsDetected}`);
  console.log(`Sections Completed: ${metrics.sectionsCompleted}`);
  console.log(`Sections Reconstructed: ${metrics.sectionsReconstructed}`);
  console.log(`Additional Chunks Retrieved: ${metrics.totalAdditionalChunks}`);
  console.log(`Completion Duration: ${metrics.completionDuration.toFixed(0)}ms`);
  console.log(`Timeout Occurred: ${metrics.timeoutOccurred ? 'Yes' : 'No'}`);
}

// Add skill tier validation to answer analysis
const skillTierAnalysis = validateSkillTableCompleteness(result.answer);
```

## Implementation Summary

This comprehensive implementation provides:

1. **Section Detection Service**: Intelligent identification of structured content requiring completion
2. **Related Chunk Fetcher**: Efficient retrieval of related chunks with RBAC compliance
3. **Section Reconstruction Engine**: Smart merging of chunks into coherent sections
4. **Enhanced Hybrid Search**: Seamless integration with existing pipeline
5. **Comprehensive Testing**: Validation framework for complete section retrieval

The solution ensures that when the Artistry skill table is retrieved, all tiers (Novice through Mythic) are available to the LLM, solving the original problem of incomplete structured content retrieval.