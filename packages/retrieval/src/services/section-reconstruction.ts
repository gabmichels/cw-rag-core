import { HybridSearchResult } from '../types/hybrid.js';
import { DetectedSection } from './section-detection.js';
import { RelatedChunkResult } from './related-chunk-fetcher.js';

/**
 * Represents a single reconstructed section
 */
export interface ReconstructedSection {
  id: string;               // Unique ID for the reconstructed section (e.g., based on sectionPath)
  sectionPath: string;      // The base section path (e.g., "block_9")
  documentId: string;       // The document ID this section belongs to
  content: string;          // The merged content of all chunks in the section
  originalChunks: { chunkId: string; score: number; }[]; // References to original and related chunks used
  payload: Record<string, any>; // Merged payload from original chunks
  combinedScore: number;    // A combined relevance score for the reconstructed section
  searchType: 'section_reconstructed';
  // Optional scores from the underlying chunks, if applicable
  vectorScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  rerankerScore?: number;
}

export interface SectionReconstructionConfig {
  enabled: boolean;
  scoringStrategy: 'average' | 'max' | 'min' | 'weighted_average';
  contentMergeStrategy: 'ordered' | 'simple_join';
  deduplicateContent: boolean; // Whether to remove duplicate sentences/paragraphs during merge
}

export class SectionReconstructionEngine {
  private config: SectionReconstructionConfig;

  constructor(config: Partial<SectionReconstructionConfig> = {}) {
    this.config = {
      enabled: true,
      scoringStrategy: 'weighted_average',
      contentMergeStrategy: 'ordered',
      deduplicateContent: true,
      ...config
    };

    console.log('🏗️ SectionReconstructionEngine initialized:', {
      enabled: this.config.enabled,
      scoring: this.config.scoringStrategy,
      contentMerge: this.config.contentMergeStrategy
    });
  }

  /**
   * Reconstructs complete sections from detected sections and their related chunks.
   */
  reconstructSections(
    detectedSections: DetectedSection[],
    relatedChunkResults: Map<string, RelatedChunkResult>
  ): ReconstructedSection[] {
    if (!this.config.enabled || detectedSections.length === 0) {
      return [];
    }

    console.log(`🔨 Reconstructing sections: ${detectedSections.length} detected, ${relatedChunkResults.size} having related chunks`);

    const reconstructed: ReconstructedSection[] = [];

    for (const detected of detectedSections) {
      const relatedResult = relatedChunkResults.get(detected.sectionPath);

      if (relatedResult && relatedResult.chunks.length > 0) {
        // Combine original chunks and newly fetched related chunks
        const allChunks = [...detected.originalChunks, ...relatedResult.chunks];
        const uniqueChunksMap = new Map<string, HybridSearchResult>();
        for (const chunk of allChunks) {
            // Prioritize original chunks if a related one has the same ID (unlikely for different chunks)
            // or if a more relevant chunk was already added. Simplistic deduplication for now.
            uniqueChunksMap.set(chunk.id, chunk);
        }
        const uniqueChunks = Array.from(uniqueChunksMap.values());

        const reconstructedSection = this.buildReconstructedSection(detected, uniqueChunks);
        reconstructed.push(reconstructedSection);
        console.log(`✨ Reconstructed section for ${detected.sectionPath} with ${uniqueChunks.length} chunks`);
      } else {
        // If no additional chunks were found, but a section was detected (meaning it had at least one original chunk),
        // we still want to "reconstruct" it from its original parts to ensure it's processed uniformly.
        // This handles cases where a section might be complete with just the initially retrieved chunks,
        // or if the fetched related chunks are empty.
        console.log(`⚠️ No *additional* chunks found for ${detected.sectionPath}, building section from original chunks only.`);
        const reconstructedSection = this.buildReconstructedSection(detected, detected.originalChunks);
        reconstructed.push(reconstructedSection);
      }
    }

    console.log(`Total reconstructed sections: ${reconstructed.length}`);
    return reconstructed;
  }

  /**
   * Builds a single reconstructed section from a DetectedSection and its associated chunks.
   */
  private buildReconstructedSection(
    detected: DetectedSection,
    allChunks: HybridSearchResult[]
  ): ReconstructedSection {
    // Sort chunks to ensure correct order for merging content
    const sortedChunks = this.sortChunksForReconstruction(allChunks);

    // Merge content
    const mergedContent = this.mergeContent(sortedChunks);

    // Combine payloads
    const combinedPayload = this.combinePayloads(sortedChunks);

    // Calculate combined score
    const combinedScore = this.calculateCombinedScore(allChunks);

    // Collect original chunk references for tracking
    const originalChunkRefs = allChunks.map(c => ({
      chunkId: c.id,
      score: c.score || 0
    }));

    // Determine representative vector/keyword/fusion/reranker scores
    const { vectorScore, keywordScore, fusionScore, rerankerScore } = this.identifyRepresentativeScores(allChunks);

    return {
      id: `reconstructed-${detected.sectionPath}-${detected.documentId}`, // Unique ID for the reconstructed output
      sectionPath: detected.sectionPath,
      documentId: detected.documentId,
      content: mergedContent,
      originalChunks: originalChunkRefs,
      payload: combinedPayload,
      combinedScore,
      searchType: 'section_reconstructed',
      vectorScore,
      keywordScore,
      fusionScore,
      rerankerScore
    };
  }

  /**
   * Sorts chunks to ensure content is merged in a logical order (e.g., by part number).
   * Assumes sectionPath "block_X/part_Y" can be sorted by Y.
   * Chunks with just "block_X" are assumed to be "part_0" or the initial chunk.
   */
  private sortChunksForReconstruction(chunks: HybridSearchResult[]): HybridSearchResult[] {
    return [...chunks].sort((a, b) => {
      const getPartNumber = (res: HybridSearchResult): number => {
        const sectionPath = res.payload?.sectionPath || res.payload?.section_path;
        if (sectionPath && typeof sectionPath === 'string') {
          const partMatch = sectionPath.match(/\/part_(\d+)$/);
          if (partMatch) {
            return parseInt(partMatch[1], 10);
          }
          // If no part number, assume it's the first part (part_0) or a base section
          const baseSectionMatch = sectionPath.match(/^(block_\d+)$/);
          if (baseSectionMatch) {
              return 0; // Treat as the first part conceptually
          }
        }
        return -1; // Unknown sorting, keep original order relative to each other by default
      };

      const partA = getPartNumber(a);
      const partB = getPartNumber(b);

      if (partA === -1 || partB === -1) {
          // If part numbers are not reliably extracted, fall back to sorting by original rank or score
          return (a.rank || 0) - (b.rank || 0) || (b.score || 0) - (a.score || 0);
      }

      return partA - partB;
    });
  }

  /**
   * Merges content from multiple chunks into a single text.
   */
  private mergeContent(chunks: HybridSearchResult[]): string {
    let merged = '';
    const seenContent = new Set<string>();

    for (const chunk of chunks) {
      if (chunk.content) {
        let contentToAdd = chunk.content.trim();

        // Simple deduplication: avoid adding identical content blocks back-to-back
        if (this.config.deduplicateContent && seenContent.has(contentToAdd)) {
          continue;
        }

        if (merged.length > 0 && !merged.endsWith('\n\n')) {
          merged += '\n\n'; // Add double newline between chunks for readability
        }
        merged += contentToAdd;
        seenContent.add(contentToAdd);
      }
    }
    return merged.trim();
  }

  /**
   * Combines payloads from multiple chunks into a single payload.
   * This involves merging metadata, potentially taking the most frequent or first-seen value.
   */
  private combinePayloads(chunks: HybridSearchResult[]): Record<string, any> {
    const combined: Record<string, any> = {};

    for (const chunk of chunks) {
      if (chunk.payload) {
        for (const key in chunk.payload) {
          if (Object.prototype.hasOwnProperty.call(chunk.payload, key)) {
            // For simplicity, last one wins for single-value keys,
            // or concatenate for array-based keys if it makes sense (e.g., keywords, authors)
            if (Array.isArray(chunk.payload[key]) && Array.isArray(combined[key])) {
              combined[key] = [...new Set([...combined[key], ...chunk.payload[key]])];
            } else if (!combined[key]) { // Only set if not already set, or overwrite if new chunk is more relevant (hard to determine)
              combined[key] = chunk.payload[key];
            }
          }
        }
      }
    }
    // Ensure sectionPath reflects the base path after reconstruction
    // Ensure sectionPath reflects the base path after reconstruction
    // The regex for sectionPath is in SectionDetectionService, so we'll just store the found sectionPath.
    combined.sectionPath = chunks[0]?.payload?.sectionPath || '';
    combined.docId = chunks[0]?.payload?.docId || ''; // Ensure docId is present
    return combined;
  }

  /**
   * Calculates a combined relevance score for the reconstructed section.
   * Considers the scores of all contributing chunks.
   */
  private calculateCombinedScore(chunks: HybridSearchResult[]): number {
    if (chunks.length === 0) return 0;

    const scores = chunks.map(c => c.score || 0);

    switch (this.config.scoringStrategy) {
      case 'max':
        return Math.max(...scores);
      case 'min':
        return Math.min(...scores);
      case 'average':
        return scores.reduce((sum, s) => sum + s, 0) / scores.length;
      case 'weighted_average':
        // A simple weighted average favoring higher scores, or original rank
        const totalScoreValue = scores.reduce((sum, s) => sum + s, 0);
        const totalWeight = chunks.reduce((sum, c) => sum + (c.rank ? 1 / c.rank : 1), 0); // Higher rank implies lower weight
        if (totalWeight === 0) return 0;
        const weightedScoreSum = chunks.reduce((sum, c) => sum + (c.score || 0) * (c.rank ? 1 / c.rank : 1), 0);
        return weightedScoreSum / totalWeight;
      default:
        return scores.reduce((sum, s) => sum + s, 0) / scores.length; // Default to average
    }
  }

  /**
   * Identifies representative scores (vector, keyword, fusion, reranker) from the set of chunks.
   * This is a heuristic and might take the max or average of the existing scores.
   */
  private identifyRepresentativeScores(chunks: HybridSearchResult[]): {
    vectorScore?: number;
    keywordScore?: number;
    fusionScore?: number;
    rerankerScore?: number;
  } {
    const vectorScores = chunks.map(c => c.vectorScore).filter(s => s !== undefined) as number[];
    const keywordScores = chunks.map(c => c.keywordScore).filter(s => s !== undefined) as number[];
    const fusionScores = chunks.map(c => c.fusionScore).filter(s => s !== undefined) as number[];
    const rerankerScores = chunks.map(c => c.rerankerScore).filter(s => s !== undefined) as number[];

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((sum, s) => sum + s, 0) / arr.length : undefined;
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : undefined;

    return {
      vectorScore: max(vectorScores), // Take max for individual component scores typically
      keywordScore: max(keywordScores),
      fusionScore: max(fusionScores),
      rerankerScore: max(rerankerScores)
    };
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
 * Factory function to create section reconstruction engine
 */
export function createSectionReconstructionEngine(
  config?: Partial<SectionReconstructionConfig>
): SectionReconstructionEngine {
  return new SectionReconstructionEngine(config);
}