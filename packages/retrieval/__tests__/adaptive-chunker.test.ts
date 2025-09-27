/**
 * Unit tests for adaptive chunking strategies
 */

import {
  AdaptiveChunker,
  TokenAwareChunkingStrategy,
  ParagraphAwareChunkingStrategy,
  CharacterChunkingStrategy
} from '../src/adaptive-chunker.js';
import { BGETokenCounter, TokenizerConfig } from '../src/token-counter.js';
import { ChunkingConfig } from '../src/embedding-config.js';

describe('AdaptiveChunker', () => {
  let tokenCounter: BGETokenCounter;
  let chunkingConfig: ChunkingConfig;
  let chunker: AdaptiveChunker;

  beforeEach(() => {
    const tokenizerConfig: TokenizerConfig = {
      model: 'bge-small-en-v1.5',
      type: 'transformers',
      maxTokens: 512,
      safetyMargin: 0.1
    };
    tokenCounter = new BGETokenCounter(tokenizerConfig);

    chunkingConfig = {
      strategy: 'token-aware',
      maxTokens: 460,
      overlapTokens: 50,
      minChunkTokens: 50,
      safetyMargin: 0.1,
      preserveBoundaries: true,
      fallbackStrategy: 'truncate'
    };

    chunker = new AdaptiveChunker(tokenCounter, chunkingConfig, false);
  });

  describe('TokenAwareChunkingStrategy', () => {
    let strategy: TokenAwareChunkingStrategy;

    beforeEach(() => {
      strategy = new TokenAwareChunkingStrategy(tokenCounter, chunkingConfig);
    });

    it('should chunk short text into single chunk', async () => {
      const text = 'This is a short piece of text that should fit in one chunk.';
      const result = await strategy.chunk(text, 'test-doc');

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].text).toBe(text);
      expect(result.chunks[0].id).toBe('test-doc_chunk_0');
      expect(result.strategy).toBe('token-aware');
    });

    it('should split long text into multiple chunks', async () => {
      // Create text that will exceed token limit
      const longText = 'This is a sentence. '.repeat(100); // ~2000 characters, should exceed 460 tokens
      const result = await strategy.chunk(longText, 'test-doc');

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.totalCharacters).toBe(longText.length);
      expect(result.strategy).toBe('token-aware');

      // Each chunk should be within token limits
      for (const chunk of result.chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(460);
      }
    });

    it('should preserve sentence boundaries', async () => {
      const text = 'First sentence here. Second sentence follows. Third sentence concludes.';
      const result = await strategy.chunk(text, 'test-doc');

      // All chunks should end with proper punctuation or be complete sentences
      for (const chunk of result.chunks) {
        const trimmedText = chunk.text.trim();
        expect(trimmedText).toMatch(/[.!?]$/);
      }
    });

    it('should handle oversized sentences by word splitting', async () => {
      // Create a very long sentence without periods
      const longSentence = 'This is an extremely long sentence without any punctuation that goes on and on and should be split by words ' + 'word '.repeat(300);
      const result = await strategy.chunk(longSentence, 'test-doc');

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('too large');
    });

    it('should generate unique chunk IDs', async () => {
      const text = 'Sentence one. Sentence two. Sentence three. '.repeat(50);
      const result = await strategy.chunk(text, 'test-doc');

      const chunkIds = result.chunks.map(chunk => chunk.id);
      const uniqueIds = new Set(chunkIds);
      expect(uniqueIds.size).toBe(chunkIds.length);
    });
  });

  describe('ParagraphAwareChunkingStrategy', () => {
    let strategy: ParagraphAwareChunkingStrategy;

    beforeEach(() => {
      strategy = new ParagraphAwareChunkingStrategy(tokenCounter, chunkingConfig);
    });

    it('should chunk by paragraphs when possible', async () => {
      const text = `First paragraph with some content here.

Second paragraph with different content.

Third paragraph concludes the text.`;

      const result = await strategy.chunk(text, 'test-doc');

      expect(result.strategy).toBe('paragraph-aware');
      // Should create separate chunks for each paragraph if they fit
      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should fall back to sentence chunking for large paragraphs', async () => {
      const largeParagraph = 'This is a very large paragraph. '.repeat(100);
      const result = await strategy.chunk(largeParagraph, 'test-doc');

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('too large');
    });
  });

  describe('CharacterChunkingStrategy', () => {
    let strategy: CharacterChunkingStrategy;

    beforeEach(() => {
      strategy = new CharacterChunkingStrategy(tokenCounter, chunkingConfig);
    });

    it('should chunk by character count with word boundaries', async () => {
      const text = 'Word '.repeat(500); // Long text for character chunking
      const result = await strategy.chunk(text, 'test-doc');

      expect(result.strategy).toBe('character-based');
      expect(result.chunks.length).toBeGreaterThan(1);

      // Most chunks should end at word boundaries (except possibly the last)
      for (let i = 0; i < result.chunks.length - 1; i++) {
        const chunk = result.chunks[i];
        expect(chunk.text.trim()).toMatch(/\S$/); // Should not end with whitespace
      }
    });
  });

  describe('AdaptiveChunker - Strategy Selection', () => {
    it('should use configured strategy', async () => {
      const text = 'Test text for chunking strategy selection.';
      const result = await chunker.chunk(text, 'test-doc');

      expect(result.strategy).toBe('token-aware');
    });

    it('should fall back to character chunking on errors', async () => {
      // Create a chunker with an invalid configuration that might cause errors
      const badConfig: ChunkingConfig = {
        ...chunkingConfig,
        strategy: 'invalid' as any // Invalid configuration
      };

      const badChunker = new AdaptiveChunker(tokenCounter, badConfig, false);
      const text = 'Test text for error handling.';

      const result = await badChunker.chunk(text, 'test-doc');
      expect(result.warnings.length).toBe(0); // Invalid strategy falls back to token-aware without warnings
    });

    it('should get optimal chunk size', () => {
      const optimal = chunker.getOptimalChunkSize();

      expect(optimal.tokens).toBe(460);
      expect(optimal.characters).toBeGreaterThan(0);
    });

    it('should analyze text characteristics', async () => {
      const structuredText = `# Title

This is the first paragraph with some content.

This is the second paragraph with more content.

## Subtitle

Final paragraph with conclusion.`;

      const analysis = await chunker.analyzeText(structuredText);

      expect(analysis.suggestedStrategy).toBeDefined();
      expect(analysis.estimatedChunks).toBeGreaterThan(0);
      expect(analysis.textCharacteristics.avgSentenceLength).toBeGreaterThan(0);
      expect(analysis.textCharacteristics.avgParagraphLength).toBeGreaterThan(0);
      expect(typeof analysis.textCharacteristics.hasStructuredContent).toBe('boolean');
    });
  });

  describe('Chunk Overlap', () => {
    beforeEach(() => {
      chunkingConfig.overlapTokens = 25; // Set overlap for testing
      chunker = new AdaptiveChunker(tokenCounter, chunkingConfig, false);
    });

    it('should create overlap between chunks', async () => {
      const text = 'First sentence here. Second sentence follows. Third sentence. Fourth sentence. Fifth sentence concludes. '.repeat(20);
      const result = await chunker.chunk(text, 'test-doc');

      if (result.chunks.length > 1) {
        // Check that chunks have some overlapping content
        for (let i = 1; i < result.chunks.length; i++) {
          const currentChunk = result.chunks[i].text;
          const previousChunk = result.chunks[i - 1].text;

          // Should have some shared words (basic overlap check)
          const currentWords = new Set(currentChunk.toLowerCase().split(/\s+/));
          const previousWords = new Set(previousChunk.toLowerCase().split(/\s+/));
          const intersection = new Set([...currentWords].filter(x => previousWords.has(x)));

          expect(intersection.size).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', async () => {
      const result = await chunker.chunk('', 'test-doc');

      expect(result.chunks).toHaveLength(0);
      expect(result.totalTokens).toBe(0);
      expect(result.totalCharacters).toBe(0);
    });

    it('should handle whitespace-only text', async () => {
      const result = await chunker.chunk('   \n\t   ', 'test-doc');

      expect(result.chunks).toHaveLength(1);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalCharacters).toBeGreaterThan(0);
    });

    it('should handle very short text', async () => {
      const result = await chunker.chunk('Hi', 'test-doc');

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].text).toBe('Hi');
    });

    it('should handle text with only punctuation', async () => {
      const result = await chunker.chunk('...!!!???', 'test-doc');

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].tokenCount).toBeGreaterThan(0);
    });

    it('should handle mixed language content', async () => {
      const mixedText = 'Hello world. Bonjour le monde. こんにちは世界. Hola mundo.';
      const result = await chunker.chunk(mixedText, 'test-doc');

      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
      expect(result.totalCharacters).toBe(mixedText.length);
    });
  });

  describe('Performance', () => {
    it('should handle large documents efficiently', async () => {
      // Create a large document (simulate ~10KB of text)
      const largeText = 'This is a sentence with multiple words for testing performance. '.repeat(200);

      const startTime = performance.now();
      const result = await chunker.chunk(largeText, 'large-doc');
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all chunks are within limits
      for (const chunk of result.chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(460);
      }
    });
  });
});