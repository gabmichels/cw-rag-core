import { HybridSearchResult } from '../types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';

// Defines a detected section that might need completion
export interface DetectedSection {
  sectionPath: string;        // The base section path (e.g., "block_9")
  documentId: string;         // The document ID this section belongs to
  originalChunks: HybridSearchResult[]; // The initial chunks that triggered detection
  confidence: number;         // Confidence that this is indeed an incomplete section
  pattern: {                  // Details about the detected pattern
    type: 'sequential_parts' | 'single_part_table' | 'partial_structure';
    detectionReasons: string[];
    metadata?: Record<string, any>;
  };
  span: {
    start: number; // For visualization or re-chunking
    end: number;
    textPreview: string;
  }
}

export interface SectionDetectionConfig {
  enabled: boolean;
  minProximityScore: number;  // Minimum score for chunks to be considered part of the same section
  maxSectionGapRank: number;  // Max rank difference between sequential chunks to detect a gap
  sectionPathRegex: RegExp;   // Regex to extract base section path from sectionPath metadata
  minTriggerChunkCount: number; // Minimum number of related chunks to trigger detection
}

export class SectionDetectionService {
  private config: SectionDetectionConfig;

  constructor(config: Partial<SectionDetectionConfig> = {}) {
    this.config = {
      enabled: true,
      minProximityScore: 0.6,
      maxSectionGapRank: 3,
      sectionPathRegex: /^(block_\d+)(?:\/part_\d+)?$/, // Handles "block_9" and "block_9/part_0"
      minTriggerChunkCount: 1,
      ...config
    };

    console.log('📝 SectionDetectionService initialized:', {
      enabled: this.config.enabled,
      minTrigger: this.config.minTriggerChunkCount
    });
  }

  /**
   * Detects potential incomplete sections within a set of search results.
   */
  detectSections(
    results: HybridSearchResult[],
    userContext: UserContext // For potential future context-aware detection
  ): DetectedSection[] {
    if (!this.config.enabled || results.length === 0) {
      return [];
    }

    const detectedSections: DetectedSection[] = [];
    const sectionsCandidates = new Map<string, HybridSearchResult[]>(); // Map of baseSectionPath -> chunks

    for (const result of results) {
      const sectionPath = result.payload?.sectionPath || result.payload?.section_path;
      const documentId = result.payload?.docId || result.payload?.documentId;

      // DEBUG: Log the FULL result object
      console.log('🔍 Section detection - FULL result object:', JSON.stringify(result, null, 2));
      console.log('🔍 Section detection - analyzing result:', {
        id: result.id,
        hasPayload: !!result.payload,
        sectionPath: sectionPath,
        documentId: documentId,
        payloadKeys: result.payload ? Object.keys(result.payload) : 'no payload'
      });

      if (sectionPath && typeof sectionPath === 'string' && documentId) {
        const match = sectionPath.match(this.config.sectionPathRegex);
        if (match && match[1]) {
          const baseSectionPath = match[1]; // e.g., "block_9" from "block_9/part_0"
          if (!sectionsCandidates.has(baseSectionPath)) {
            sectionsCandidates.set(baseSectionPath, []);
          }
          sectionsCandidates.get(baseSectionPath)?.push(result);
        }
      }
    }

    console.log(`Initial section candidates from ${results.length} results:`, Array.from(sectionsCandidates.keys()));

    for (const [baseSectionPath, chunks] of sectionsCandidates.entries()) {
      if (chunks.length >= this.config.minTriggerChunkCount) {
        const sortedChunks = [...chunks].sort((a, b) => (a.rank || 0) - (b.rank || 0)); // Sort by original rank

        // Check for sequential parts pattern
        const sequentialPattern = this.detectSequentialPartsPattern(sortedChunks, baseSectionPath);
        if (sequentialPattern) {
          detectedSections.push(sequentialPattern);
          console.log(`Detected sequential parts pattern for ${baseSectionPath}:`, sequentialPattern.pattern.detectionReasons);
          continue; // Move to next candidate
        }

        // Check for single part table pattern
        const singlePartTablePattern = this.detectSinglePartTablePattern(sortedChunks, baseSectionPath);
        if (singlePartTablePattern) {
          detectedSections.push(singlePartTablePattern);
          console.log(`Detected single part table pattern for ${baseSectionPath}:`, singlePartTablePattern.pattern.detectionReasons);
          continue;
        }

        // Generic partial structure detection (if other patterns don't match)
        const partialStructure = this.detectPartialStructure(sortedChunks, baseSectionPath);
        if (partialStructure) {
          detectedSections.push(partialStructure);
          console.log(`Detected generic partial structure for ${baseSectionPath}:`, partialStructure.pattern.detectionReasons);
        }
      }
    }

    console.log(`Final detected sections: ${detectedSections.length}`);
    return detectedSections;
  }

  /**
   * Detects if multiple chunks from the same baseSectionPath indicate missing sequential parts.
   * e.g., "block_9/part_0" and "block_9/part_2" suggests "block_9/part_1" is missing.
   * Also handles a single "block_X" chunk possibly indicating a missing "block_X/part_Y"
   */
  private detectSequentialPartsPattern(
    chunks: HybridSearchResult[],
    baseSectionPath: string
  ): DetectedSection | null {
    if (chunks.length === 0) return null;

    const documentId = chunks[0].payload?.docId || '';
    const partNumbers = new Set<number>();
    let hasBaseSectionOnly = false; // "block_7" without /part_X

    for (const chunk of chunks) {
      const sectionPath = chunk.payload?.sectionPath || chunk.payload?.section_path;
      if (sectionPath && typeof sectionPath === 'string') {
        const partMatch = sectionPath.match(/\/part_(\d+)$/);
        if (partMatch) {
          partNumbers.add(parseInt(partMatch[1], 10));
        } else if (sectionPath === baseSectionPath) {
          hasBaseSectionOnly = true;
        }
      }
    }

    // Sort unique part numbers
    const sortedPartNumbers = Array.from(partNumbers).sort((a, b) => a - b);

    // Scenario 1: Multiple parts, but not all consecutive from 0 (e.g., 0, 2, but not 1)
    if (sortedPartNumbers.length > 1) {
      // Check for gaps in sequence (e.g., 0, 2 means 1 is missing)
      for (let i = 0; i < sortedPartNumbers.length - 1; i++) {
        if (sortedPartNumbers[i + 1] !== sortedPartNumbers[i] + 1) {
          return this.createDetectedSection(
            baseSectionPath,
            documentId,
            chunks,
            0.8, // High confidence for missing sequential parts
            'sequential_parts',
            ['missing_sequential_part']
          );
        }
      }
      // If we made it here, parts are sequential (e.g., 0, 1, 2).
      // Check if it's "block_X/part_0" and "block_X/part_1" and potentially more
      // If the original query *also* returned "block_X" without a part, this is a strong indicator
      // that we need to complete the section.
      if (hasBaseSectionOnly) {
         return this.createDetectedSection(
            baseSectionPath,
            documentId,
            chunks,
            0.9, // Very high confidence
            'sequential_parts',
            ['base_section_and_parts_found']
          );
      }

      // If parts are sequential (0,1,2,...) but not all possible parts are present.
      // E.g., if there are 7 parts total, but we only retrieved 3.
      // This is hard to detect without knowing the total parts, so for now,
      // we rely on the `hasBaseSectionOnly` or explicit gaps.
      // A sophisticated approach would use the `relatedChunkFetcher` to identify total parts.
    }

    // Scenario 2: Only one part (e.g., "block_9/part_0") is found, or only the base section ("block_9")
    if (sortedPartNumbers.length === 0 && hasBaseSectionOnly) {
      // Scenario 2a: Only base section (e.g., "block_9") is found, no explicit parts
      const hasMarkdownTableSyntax = chunks.some(c => (c.content?.includes('|') && c.content?.includes('---')));
      if (hasMarkdownTableSyntax) {
        return this.createDetectedSection(
          baseSectionPath,
          documentId,
          chunks,
          0.8, // High confidence if directly referencing the block and containing table syntax
          'sequential_parts',
          ['base_section_only_with_table_syntax']
        );
      } else {
        return this.createDetectedSection(
          baseSectionPath,
          documentId,
          chunks,
          0.6, // Moderate confidence if just base section, implies potential start of new structure
          'sequential_parts',
          ['base_section_only']
        );
      }
    } else if (sortedPartNumbers.length === 1 && sortedPartNumbers[0] === 0) {
      // Scenario 2b: Only "part_0" (e.g., "block_9/part_0") is found
      const hasMarkdownTableSyntax = chunks.some(c => (c.content?.includes('|') && c.content?.includes('---')));
      if (hasMarkdownTableSyntax) {
        return this.createDetectedSection(
          baseSectionPath,
          documentId,
          chunks,
          0.9, // Very high confidence if it's part_0 with table syntax
          'sequential_parts',
          ['single_part_0_with_table_syntax']
        );
      } else {
        return this.createDetectedSection(
          baseSectionPath,
          documentId,
          chunks,
          0.7, // Moderate confidence if just part_0, implies potential start of new structure
          'sequential_parts',
          ['single_part_0_found']
        );
      }
    }

    return null;
  }

  /**
   * Detects if a chunk contains partial table structure indicating missing parts.
   * This is a more generic check, less reliant on `sectionPath` format.
   * Checks for presence of keywords like "Tier", "Abilities", and markdown table syntax.
   */
  private detectSinglePartTablePattern(
    chunks: HybridSearchResult[],
    baseSectionPath: string
  ): DetectedSection | null {
    for (const chunk of chunks) {
      if (chunk.content) {
        const contentLower = chunk.content.toLowerCase();
        const hasTableKeywords = contentLower.includes('tier') && (contentLower.includes('abilities') || contentLower.includes('examples'));
        const hasMarkdownTableSyntax = contentLower.includes('|') && contentLower.includes('---');
        const documentId = chunk.payload?.docId || '';

        if (hasMarkdownTableSyntax) { // Only check for markdown table syntax, not keywords
          return this.createDetectedSection(
            baseSectionPath,
            documentId,
            [chunk],
            0.85, // High confidence for explicit markdown table fragments
            'single_part_table',
            ['markdown_table_syntax_found']
          );
        }
        // Removed `hasTableKeywords` check
      }
    }
    return null;
  }

  /**
   * Generic detection for any partial structure based on content and proximity.
   */
  private detectPartialStructure(
    chunks: HybridSearchResult[],
    baseSectionPath: string
  ): DetectedSection | null {
    if (chunks.length === 0) return null;

    const documentId = chunks[0].payload?.docId || '';
    const detectionReasons: string[] = [];
    let confidence = 0.5; // Base confidence

    // Analyze content for structured keywords
    const combinedContent = chunks.map(c => c.content || '').join(' ').toLowerCase();
    // Removed content-specific keyword checks here, relying on structural patterns more.
    // If a generic 'table' keyword is required, it must be carefully defined to avoid being content-specific.
    // For now, rely on sectionPath, part numbers, and markdown table syntax.

    // Simple heuristic: if we have more than one chunk from the same baseSectionPath
    // and they are not perfectly sequential, or if there's only one chunk
    // but it has a high score and indicates structured content.
    if (chunks.length > 1) {
       detectionReasons.push('multiple_chunks_from_same_base_section');
       confidence += 0.1;
    }

    // If only one chunk, check if its content heavily implies structured content that might be split
    if (chunks.length === 1 && chunks[0].content) {
        // If content has markdown table syntax and good score, boost confidence
        const contentLower = chunks[0].content.toLowerCase();
        if (contentLower.includes('|') && contentLower.includes('---') && (chunks[0].score || 0) > this.config.minProximityScore) {
          detectionReasons.push('single_chunk_with_markdown_table_syntax_and_good_score');
          confidence += 0.15;
        }
    }

    if (detectionReasons.length > 0) {
      return this.createDetectedSection(
        baseSectionPath,
        documentId,
        chunks,
        Math.min(confidence, 1.0), // Cap confidence at 1.0
        'partial_structure',
        detectionReasons
      );
    }

    return null;
  }


  /**
   * Helper to create a DetectedSection object
   */
  private createDetectedSection(
    sectionPath: string,
    documentId: string,
    originalChunks: HybridSearchResult[],
    confidence: number,
    type: DetectedSection['pattern']['type'],
    detectionReasons: string[]
  ): DetectedSection {
    const combinedContent = originalChunks.map(c => c.content).join(' ');
    return {
      sectionPath,
      documentId,
      originalChunks,
      confidence,
      pattern: {
        type,
        detectionReasons,
      },
      span: {
        start: 0, // Placeholder, actual span requires more sophisticated analysis
        end: combinedContent.length,
        textPreview: combinedContent.substring(0, 150) + '...'
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SectionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SectionDetectionConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create section detection service
 */
export function createSectionDetectionService(
  config?: Partial<SectionDetectionConfig>
): SectionDetectionService {
  return new SectionDetectionService(config);
}