/**
 * Chunk validation and ingestion guard for quality control
 */

import { ChunkResult } from './adaptive-chunker.js';

export interface ChunkValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-1 quality score
}

export interface IngestionGuardConfig {
  minContentLength: number;
  maxContentLength: number;
  requireMetadata: boolean;
  requireSectionPath: boolean;
  minQualityScore: number;
  checkDuplicates: boolean;
}

export const DEFAULT_INGESTION_GUARD_CONFIG: IngestionGuardConfig = {
  minContentLength: 10,
  maxContentLength: 10000,
  requireMetadata: true,
  requireSectionPath: false,
  minQualityScore: 0.5,
  checkDuplicates: true
};

/**
 * Validates chunk quality and metadata completeness
 */
export class ChunkValidator {
  private config: IngestionGuardConfig;

  constructor(config: Partial<IngestionGuardConfig> = {}) {
    this.config = { ...DEFAULT_INGESTION_GUARD_CONFIG, ...config };
  }

  /**
   * Validate a single chunk
   */
  validateChunk(chunk: ChunkResult): ChunkValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 1.0;

    // Content validation
    if (!chunk.text || chunk.text.trim().length === 0) {
      errors.push('Chunk has no content');
      score *= 0.1;
    } else {
      const content = chunk.text.trim();

      if (content.length < this.config.minContentLength) {
        errors.push(`Content too short: ${content.length} < ${this.config.minContentLength}`);
        score *= 0.5;
      }

      if (content.length > this.config.maxContentLength) {
        errors.push(`Content too long: ${content.length} > ${this.config.maxContentLength}`);
        score *= 0.8;
      }

      // Check for meaningful content (not just whitespace/punctuation)
      const meaningfulChars = content.replace(/[\s\p{P}]/gu, '').length;
      if (meaningfulChars < 5) {
        warnings.push('Chunk contains very little meaningful content');
        score *= 0.7;
      }
    }

    // Token count validation
    if (chunk.tokenCount <= 0) {
      errors.push('Invalid token count');
      score *= 0.1;
    }

    if (chunk.tokenCount > 1000) { // Very rough upper bound
      warnings.push('Very high token count may cause issues');
      score *= 0.9;
    }

    // ID validation
    if (!chunk.id || chunk.id.trim().length === 0) {
      errors.push('Chunk missing ID');
      score *= 0.1;
    }

    // Metadata validation
    if (this.config.requireMetadata && (!chunk.metadata || Object.keys(chunk.metadata).length === 0)) {
      errors.push('Chunk missing required metadata');
      score *= 0.8;
    }

    // Section path validation
    if (this.config.requireSectionPath && !chunk.sectionPath) {
      warnings.push('Chunk missing section path');
      score *= 0.9;
    }

    // Index validation
    if (chunk.startIndex < 0 || chunk.endIndex < chunk.startIndex) {
      warnings.push('Invalid start/end indices');
      score *= 0.95;
    }

    // Character count consistency
    const actualCharCount = chunk.text.trim().length;
    if (Math.abs(actualCharCount - chunk.characterCount) > 1) {
      warnings.push('Character count mismatch');
      score *= 0.98;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Validate multiple chunks
   */
  validateChunks(chunks: ChunkResult[]): {
    validChunks: ChunkResult[];
    invalidChunks: Array<{ chunk: ChunkResult; validation: ChunkValidationResult }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      avgScore: number;
      errors: Record<string, number>;
    };
  } {
    const validChunks: ChunkResult[] = [];
    const invalidChunks: Array<{ chunk: ChunkResult; validation: ChunkValidationResult }> = [];
    const errorCounts: Record<string, number> = {};
    let totalScore = 0;

    for (const chunk of chunks) {
      const validation = this.validateChunk(chunk);

      if (validation.isValid && validation.score >= this.config.minQualityScore) {
        validChunks.push(chunk);
      } else {
        invalidChunks.push({ chunk, validation });
      }

      totalScore += validation.score;

      // Count errors
      for (const error of validation.errors) {
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      }
    }

    return {
      validChunks,
      invalidChunks,
      summary: {
        total: chunks.length,
        valid: validChunks.length,
        invalid: invalidChunks.length,
        avgScore: chunks.length > 0 ? totalScore / chunks.length : 0,
        errors: errorCounts
      }
    };
  }

  /**
   * Check for duplicate chunks
   */
  findDuplicates(chunks: ChunkResult[]): Array<{
    original: ChunkResult;
    duplicates: ChunkResult[];
    similarity: number;
  }> {
    const duplicates: Array<{
      original: ChunkResult;
      duplicates: ChunkResult[];
      similarity: number;
    }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkA = chunks[i];
      const chunkDuplicates: ChunkResult[] = [];

      for (let j = i + 1; j < chunks.length; j++) {
        const chunkB = chunks[j];
        const similarity = this.calculateSimilarity(chunkA, chunkB);

        if (similarity > 0.8) { // High similarity threshold
          chunkDuplicates.push(chunkB);
        }
      }

      if (chunkDuplicates.length > 0) {
        duplicates.push({
          original: chunkA,
          duplicates: chunkDuplicates,
          similarity: chunkDuplicates.length > 0 ? this.calculateSimilarity(chunkA, chunkDuplicates[0]) : 0
        });
      }
    }

    return duplicates;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateSimilarity(chunkA: ChunkResult, chunkB: ChunkResult): number {
    const textA = chunkA.text.toLowerCase().split(/\s+/);
    const textB = chunkB.text.toLowerCase().split(/\s+/);

    const setA = new Set(textA);
    const setB = new Set(textB);

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IngestionGuardConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Ingestion guard that prevents bad chunks from being stored
 */
export class IngestionGuard {
  private validator: ChunkValidator;

  constructor(config: Partial<IngestionGuardConfig> = {}) {
    this.validator = new ChunkValidator(config);
  }

  /**
   * Guard chunks before ingestion
   */
  async guardChunks(chunks: ChunkResult[]): Promise<{
    approved: ChunkResult[];
    rejected: Array<{ chunk: ChunkResult; reason: string }>;
    report: {
      approved: number;
      rejected: number;
      avgQuality: number;
      issues: string[];
    };
  }> {
    const validation = this.validator.validateChunks(chunks);
    const duplicates = this.validator.findDuplicates(validation.validChunks);

    const approved: ChunkResult[] = [];
    const rejected: Array<{ chunk: ChunkResult; reason: string }> = [];
    const issues: string[] = [];

    // Add validated chunks
    approved.push(...validation.validChunks);

    // Add rejected chunks with reasons
    for (const { chunk, validation: val } of validation.invalidChunks) {
      rejected.push({
        chunk,
        reason: `Validation failed: ${val.errors.join(', ')}`
      });
    }

    // Handle duplicates
    for (const dup of duplicates) {
      // Keep only the first occurrence, reject others
      dup.duplicates.forEach(duplicate => {
        const index = approved.findIndex(c => c.id === duplicate.id);
        if (index >= 0) {
          approved.splice(index, 1);
          rejected.push({
            chunk: duplicate,
            reason: `Duplicate of chunk ${dup.original.id} (similarity: ${(dup.similarity * 100).toFixed(1)}%)`
          });
        }
      });
    }

    // Generate issues summary
    if (validation.summary.invalid > 0) {
      issues.push(`${validation.summary.invalid} chunks failed validation`);
    }
    if (duplicates.length > 0) {
      issues.push(`${duplicates.length} duplicate groups found`);
    }

    return {
      approved,
      rejected,
      report: {
        approved: approved.length,
        rejected: rejected.length,
        avgQuality: validation.summary.avgScore,
        issues
      }
    };
  }

  /**
   * Update guard configuration
   */
  updateConfig(config: Partial<IngestionGuardConfig>): void {
    this.validator.updateConfig(config);
  }
}

/**
 * Factory functions
 */
export function createChunkValidator(config?: Partial<IngestionGuardConfig>): ChunkValidator {
  return new ChunkValidator(config);
}

export function createIngestionGuard(config?: Partial<IngestionGuardConfig>): IngestionGuard {
  return new IngestionGuard(config);
}