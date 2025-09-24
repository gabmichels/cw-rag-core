/**
 * Adaptive chunking algorithms with token awareness and boundary preservation
 */

import { TokenCounter, TokenCountResult } from './token-counter.js';
import { ChunkingConfig } from './embedding-config.js';

export interface ChunkResult {
  id: string;
  text: string;
  tokenCount: number;
  characterCount: number;
  startIndex: number;
  endIndex: number;
  sectionPath?: string;
  metadata?: Record<string, any>;
}

export interface ChunkingResult {
  chunks: ChunkResult[];
  totalTokens: number;
  totalCharacters: number;
  strategy: string;
  warnings: string[];
}

/**
 * Abstract base class for chunking strategies
 */
export abstract class ChunkingStrategy {
  protected tokenCounter: TokenCounter;
  protected config: ChunkingConfig;

  constructor(tokenCounter: TokenCounter, config: ChunkingConfig) {
    this.tokenCounter = tokenCounter;
    this.config = config;
  }

  abstract chunk(text: string, baseId: string, sectionPath?: string): Promise<ChunkingResult>;

  /**
   * Create overlap between chunks for context preservation
   */
  protected createOverlap(chunks: ChunkResult[]): ChunkResult[] {
    if (this.config.overlapTokens <= 0 || chunks.length <= 1) {
      return chunks;
    }

    const overlappedChunks: ChunkResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let text = chunk.text;

      // Add overlap from previous chunk
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapText = this.getOverlapText(prevChunk.text, this.config.overlapTokens);
        text = overlapText + ' ' + text;
      }

      overlappedChunks.push({
        ...chunk,
        text: text.trim(),
        characterCount: text.trim().length
      });
    }

    return overlappedChunks;
  }

  /**
   * Extract overlap text from the end of previous chunk
   */
  protected getOverlapText(text: string, maxOverlapTokens: number): string {
    const words = text.split(/\s+/);
    const estimatedWordsPerToken = 0.75; // Conservative estimate
    const maxWords = Math.floor(maxOverlapTokens * estimatedWordsPerToken);

    if (words.length <= maxWords) {
      return text;
    }

    return words.slice(-maxWords).join(' ');
  }

  /**
   * Validate chunk against token limits
   */
  protected async validateChunk(text: string): Promise<{ valid: boolean; tokenCount: number; suggestion?: string }> {
    const result = await this.tokenCounter.countTokens(text);

    if (result.isWithinLimit) {
      return { valid: true, tokenCount: result.tokenCount };
    }

    return {
      valid: false,
      tokenCount: result.tokenCount,
      suggestion: `Chunk exceeds token limit: ${result.tokenCount} > ${result.safeTokenLimit}`
    };
  }
}

/**
 * Token-aware chunking strategy that respects sentence boundaries
 */
export class TokenAwareChunkingStrategy extends ChunkingStrategy {
  async chunk(text: string, baseId: string, sectionPath?: string): Promise<ChunkingResult> {
    const chunks: ChunkResult[] = [];
    const warnings: string[] = [];
    let currentIndex = 0;
    let chunkIndex = 0;

    // Split text into sentences
    const sentences = this.splitIntoSentences(text);
    let currentChunk = '';
    let chunkStartIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const testChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;

      // Check if adding this sentence would exceed token limit
      const validation = await this.validateChunk(testChunk);

      if (validation.valid) {
        // Safe to add this sentence
        currentChunk = testChunk;
      } else {
        // Would exceed limit, save current chunk and start new one
        if (currentChunk) {
          const chunkResult = await this.createChunkResult(
            currentChunk,
            baseId,
            chunkIndex,
            chunkStartIndex,
            currentIndex,
            sectionPath
          );
          chunks.push(chunkResult);
          chunkIndex++;
        }

        // Handle oversized single sentence
        if (!currentChunk && !validation.valid) {
          // Single sentence is too large, need to split it
          const splitSentences = await this.splitOversizedSentence(sentence, baseId, chunkIndex, sectionPath);
          chunks.push(...splitSentences);
          chunkIndex += splitSentences.length;
          warnings.push(`Sentence too large, had to split: ${sentence.substring(0, 50)}...`);
        } else {
          // Start new chunk with current sentence
          currentChunk = sentence;
          chunkStartIndex = currentIndex;
        }
      }

      currentIndex += sentence.length + 1; // +1 for space
    }

    // Add final chunk if exists
    if (currentChunk) {
      const chunkResult = await this.createChunkResult(
        currentChunk,
        baseId,
        chunkIndex,
        chunkStartIndex,
        currentIndex,
        sectionPath
      );
      chunks.push(chunkResult);
    }

    // Apply overlap if configured
    const finalChunks = this.createOverlap(chunks);

    return {
      chunks: finalChunks,
      totalTokens: finalChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      totalCharacters: text.length,
      strategy: 'token-aware',
      warnings
    };
  }

  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting that handles various edge cases
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .filter(s => s.trim().length > 0);

    return sentences.length > 0 ? sentences : [text];
  }

  private async splitOversizedSentence(
    sentence: string,
    baseId: string,
    startIndex: number,
    sectionPath?: string
  ): Promise<ChunkResult[]> {
    const chunks: ChunkResult[] = [];
    const words = sentence.split(/\s+/);
    let currentChunk = '';
    let chunkIndex = startIndex;

    for (const word of words) {
      const testChunk = currentChunk ? currentChunk + ' ' + word : word;
      const validation = await this.validateChunk(testChunk);

      if (validation.valid) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          const chunkResult = await this.createChunkResult(
            currentChunk,
            baseId,
            chunkIndex,
            0,
            currentChunk.length,
            sectionPath
          );
          chunks.push(chunkResult);
          chunkIndex++;
        }
        currentChunk = word;
      }
    }

    if (currentChunk) {
      const chunkResult = await this.createChunkResult(
        currentChunk,
        baseId,
        chunkIndex,
        0,
        currentChunk.length,
        sectionPath
      );
      chunks.push(chunkResult);
    }

    return chunks;
  }

  private async createChunkResult(
    text: string,
    baseId: string,
    index: number,
    startIndex: number,
    endIndex: number,
    sectionPath?: string
  ): Promise<ChunkResult> {
    const tokenResult = await this.tokenCounter.countTokens(text);

    return {
      id: `${baseId}_chunk_${index}`,
      text: text.trim(),
      tokenCount: tokenResult.tokenCount,
      characterCount: text.trim().length,
      startIndex,
      endIndex,
      sectionPath,
      metadata: {
        strategy: 'token-aware',
        withinLimit: tokenResult.isWithinLimit
      }
    };
  }
}

/**
 * Paragraph-aware chunking strategy
 */
export class ParagraphAwareChunkingStrategy extends ChunkingStrategy {
  async chunk(text: string, baseId: string, sectionPath?: string): Promise<ChunkingResult> {
    const chunks: ChunkResult[] = [];
    const warnings: string[] = [];

    // Split by paragraphs (double newlines or single newlines with significant content)
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter(p => p.trim().length > 0);

    let chunkIndex = 0;
    let currentIndex = 0;

    for (const paragraph of paragraphs) {
      const validation = await this.validateChunk(paragraph);

      if (validation.valid) {
        // Paragraph fits in one chunk
        const chunkResult = await this.createChunkResult(
          paragraph,
          baseId,
          chunkIndex,
          currentIndex,
          currentIndex + paragraph.length,
          sectionPath
        );
        chunks.push(chunkResult);
        chunkIndex++;
      } else {
        // Paragraph too large, fall back to sentence-based chunking
        const sentenceStrategy = new TokenAwareChunkingStrategy(this.tokenCounter, this.config);
        const sentenceResult = await sentenceStrategy.chunk(paragraph, `${baseId}_para_${chunkIndex}`, sectionPath);

        chunks.push(...sentenceResult.chunks);
        warnings.push(...sentenceResult.warnings);
        warnings.push(`Paragraph too large, split into ${sentenceResult.chunks.length} chunks`);
        chunkIndex += sentenceResult.chunks.length;
      }

      currentIndex += paragraph.length + 2; // +2 for paragraph break
    }

    const finalChunks = this.createOverlap(chunks);

    return {
      chunks: finalChunks,
      totalTokens: finalChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      totalCharacters: text.length,
      strategy: 'paragraph-aware',
      warnings
    };
  }

  private async createChunkResult(
    text: string,
    baseId: string,
    index: number,
    startIndex: number,
    endIndex: number,
    sectionPath?: string
  ): Promise<ChunkResult> {
    const tokenResult = await this.tokenCounter.countTokens(text);

    return {
      id: `${baseId}_para_${index}`,
      text: text.trim(),
      tokenCount: tokenResult.tokenCount,
      characterCount: text.trim().length,
      startIndex,
      endIndex,
      sectionPath,
      metadata: {
        strategy: 'paragraph-aware',
        withinLimit: tokenResult.isWithinLimit
      }
    };
  }
}

/**
 * Simple character-based chunking (fallback strategy)
 */
export class CharacterChunkingStrategy extends ChunkingStrategy {
  async chunk(text: string, baseId: string, sectionPath?: string): Promise<ChunkingResult> {
    const chunks: ChunkResult[] = [];
    const warnings: string[] = [];

    // Estimate characters per token for this model
    const sampleResult = await this.tokenCounter.countTokens(text.substring(0, Math.min(1000, text.length)));
    const avgCharsPerToken = sampleResult.characterCount / sampleResult.tokenCount;
    const maxCharsPerChunk = Math.floor(this.config.maxTokens * avgCharsPerToken * 0.9); // 90% safety margin

    let chunkIndex = 0;
    let currentIndex = 0;

    while (currentIndex < text.length) {
      const endIndex = Math.min(currentIndex + maxCharsPerChunk, text.length);
      let chunkText = text.substring(currentIndex, endIndex);

      // Try to break at word boundary if not at end
      if (endIndex < text.length) {
        const lastSpaceIndex = chunkText.lastIndexOf(' ');
        if (lastSpaceIndex > chunkText.length * 0.8) { // Only if we're not losing too much
          chunkText = chunkText.substring(0, lastSpaceIndex);
        }
      }

      const tokenResult = await this.tokenCounter.countTokens(chunkText);

      const chunkResult: ChunkResult = {
        id: `${baseId}_char_${chunkIndex}`,
        text: chunkText.trim(),
        tokenCount: tokenResult.tokenCount,
        characterCount: chunkText.trim().length,
        startIndex: currentIndex,
        endIndex: currentIndex + chunkText.length,
        sectionPath,
        metadata: {
          strategy: 'character-based',
          withinLimit: tokenResult.isWithinLimit
        }
      };

      chunks.push(chunkResult);

      if (!tokenResult.isWithinLimit) {
        warnings.push(`Character-based chunk ${chunkIndex} exceeds token limit: ${tokenResult.tokenCount}`);
      }

      currentIndex += chunkText.length;
      chunkIndex++;
    }

    return {
      chunks,
      totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
      totalCharacters: text.length,
      strategy: 'character-based',
      warnings
    };
  }
}

/**
 * Adaptive chunker that selects the best strategy based on content
 */
export class AdaptiveChunker {
  private tokenCounter: TokenCounter;
  private config: ChunkingConfig;
  private strategies: Map<string, ChunkingStrategy>;

  constructor(tokenCounter: TokenCounter, config: ChunkingConfig) {
    this.tokenCounter = tokenCounter;
    this.config = config;
    this.strategies = new Map([
      ['token-aware', new TokenAwareChunkingStrategy(tokenCounter, config)],
      ['paragraph', new ParagraphAwareChunkingStrategy(tokenCounter, config)],
      ['character', new CharacterChunkingStrategy(tokenCounter, config)]
    ]);
  }

  async chunk(text: string, baseId: string, sectionPath?: string): Promise<ChunkingResult> {
    // Select strategy based on configuration or content analysis
    let selectedStrategy = this.config.strategy;

    // Fallback logic
    const strategy = this.strategies.get(selectedStrategy) || this.strategies.get('token-aware')!;

    try {
      return await strategy.chunk(text, baseId, sectionPath);
    } catch (error) {
      // Fallback to character-based chunking on any error
      console.warn(`Chunking strategy ${selectedStrategy} failed, falling back to character-based:`, error);
      const fallbackStrategy = this.strategies.get('character')!;
      const result = await fallbackStrategy.chunk(text, baseId, sectionPath);
      result.warnings.push(`Fallback to character-based chunking due to error: ${(error as Error).message}`);
      return result;
    }
  }

  /**
   * Get optimal chunk size for current configuration
   */
  getOptimalChunkSize(): { tokens: number; characters: number } {
    const estimatedCharsPerToken = 3.5; // Average estimation
    return {
      tokens: this.config.maxTokens,
      characters: Math.floor(this.config.maxTokens * estimatedCharsPerToken)
    };
  }

  /**
   * Analyze text and suggest best chunking strategy
   */
  async analyzeText(text: string): Promise<{
    suggestedStrategy: string;
    estimatedChunks: number;
    textCharacteristics: {
      hasStructuredContent: boolean;
      avgSentenceLength: number;
      avgParagraphLength: number;
    };
  }> {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;

    const hasStructuredContent = paragraphs.length > 1 && avgParagraphLength > avgSentenceLength * 3;

    let suggestedStrategy = 'token-aware';
    if (hasStructuredContent) {
      suggestedStrategy = 'paragraph';
    }

    const tokenResult = await this.tokenCounter.countTokens(text);
    const estimatedChunks = Math.ceil(tokenResult.tokenCount / this.config.maxTokens);

    return {
      suggestedStrategy,
      estimatedChunks,
      textCharacteristics: {
        hasStructuredContent,
        avgSentenceLength,
        avgParagraphLength
      }
    };
  }
}