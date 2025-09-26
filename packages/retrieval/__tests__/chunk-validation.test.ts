/**
 * Unit tests for chunk validation and ingestion guard
 */

import { ChunkValidator, IngestionGuard, createIngestionGuard } from '../src/chunk-validation.js';

describe('ChunkValidator', () => {
  let validator: ChunkValidator;

  beforeEach(() => {
    validator = new ChunkValidator();
  });

  describe('Chunk Validation', () => {
    it('should validate good chunks', () => {
      const chunk = {
        id: 'test-1',
        text: 'This is a valid chunk with meaningful content.',
        tokenCount: 8,
        characterCount: 45,
        startIndex: 0,
        endIndex: 45,
        metadata: { docId: 'doc-1', tenantId: 'tenant-1' }
      };

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should reject empty chunks', () => {
      const chunk = {
        id: 'test-2',
        text: '',
        tokenCount: 0,
        characterCount: 0,
        startIndex: 0,
        endIndex: 0
      };

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Chunk has no content');
    });

    it('should reject chunks with too few characters', () => {
      const chunk = {
        id: 'test-3',
        text: 'Hi',
        tokenCount: 1,
        characterCount: 2,
        startIndex: 0,
        endIndex: 2
      };

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('too short'))).toBe(true);
    });

    it('should reject chunks that are too long', () => {
      const longText = 'word '.repeat(3000); // Very long chunk exceeding 10000 chars
      const chunk = {
        id: 'test-4',
        text: longText,
        tokenCount: 3000,
        characterCount: longText.length,
        startIndex: 0,
        endIndex: longText.length
      };

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('too long'))).toBe(true);
    });

    it('should warn about high token counts', () => {
      const chunk = {
        id: 'test-5',
        text: 'This chunk has a very high token count that may cause issues.',
        tokenCount: 1500,
        characterCount: 60,
        startIndex: 0,
        endIndex: 60
      };

      const result = validator.validateChunk(chunk);
      expect(result.warnings.some(w => w.includes('token count'))).toBe(true);
    });

    it('should reject chunks without IDs', () => {
      const chunk = {
        id: '',
        text: 'Valid content but no ID',
        tokenCount: 5,
        characterCount: 25,
        startIndex: 0,
        endIndex: 25
      };

      const result = validator.validateChunk(chunk);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Chunk missing ID');
    });

    it('should warn about missing metadata when required', () => {
      const strictValidator = new ChunkValidator({ requireMetadata: true });
      const chunk = {
        id: 'test-6',
        text: 'Valid content',
        tokenCount: 5,
        characterCount: 13,
        startIndex: 0,
        endIndex: 13
        // No metadata
      };

      const result = strictValidator.validateChunk(chunk);
      expect(result.errors.some(e => e.includes('metadata'))).toBe(true);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple chunks', () => {
      const chunks = [
        {
          id: 'good-1',
          text: 'This is good content.',
          tokenCount: 5,
          characterCount: 22,
          startIndex: 0,
          endIndex: 22,
          metadata: { docId: 'doc-1' }
        },
        {
          id: 'bad-1',
          text: '', // Empty
          tokenCount: 0,
          characterCount: 0,
          startIndex: 0,
          endIndex: 0
        }
      ];

      const result = validator.validateChunks(chunks);
      expect(result.validChunks).toHaveLength(1);
      expect(result.invalidChunks).toHaveLength(1);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.invalid).toBe(1);
      expect(result.summary.avgScore).toBeGreaterThan(0);
    });

    it('should count error types', () => {
      const chunks = [
        { id: '', text: 'no id', tokenCount: 2, characterCount: 6, startIndex: 0, endIndex: 6 },
        { id: '2', text: '', tokenCount: 0, characterCount: 0, startIndex: 0, endIndex: 0 }
      ];

      const result = validator.validateChunks(chunks);
      expect(result.summary.errors['Chunk missing ID']).toBe(1);
      expect(result.summary.errors['Chunk has no content']).toBe(1);
    });
  });

  describe('Duplicate Detection', () => {
    it('should find duplicate chunks', () => {
      const chunks = [
        {
          id: 'orig-1',
          text: 'This is the original text content.',
          tokenCount: 6,
          characterCount: 32,
          startIndex: 0,
          endIndex: 32
        },
        {
          id: 'dup-1',
          text: 'This is the original text content.', // Exact duplicate
          tokenCount: 6,
          characterCount: 32,
          startIndex: 0,
          endIndex: 32
        },
        {
          id: 'diff-1',
          text: 'This is completely different content.',
          tokenCount: 5,
          characterCount: 35,
          startIndex: 0,
          endIndex: 35
        }
      ];

      const duplicates = validator.findDuplicates(chunks);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].duplicates).toHaveLength(1);
      expect(duplicates[0].duplicates[0].id).toBe('dup-1');
    });

    it('should not find duplicates for different content', () => {
      const chunks = [
        {
          id: 'text-1',
          text: 'Machine learning is important.',
          tokenCount: 4,
          characterCount: 28,
          startIndex: 0,
          endIndex: 28
        },
        {
          id: 'text-2',
          text: 'Weather forecasting uses AI.',
          tokenCount: 4,
          characterCount: 27,
          startIndex: 0,
          endIndex: 27
        }
      ];

      const duplicates = validator.findDuplicates(chunks);
      expect(duplicates).toHaveLength(0);
    });
  });
});

describe('IngestionGuard', () => {
  let guard: IngestionGuard;

  beforeEach(() => {
    guard = createIngestionGuard({
      minQualityScore: 0.6
    });
  });

  describe('Chunk Guarding', () => {
    it('should approve high-quality chunks', async () => {
      const chunks = [
        {
          id: 'good-1',
          text: 'This is a high-quality chunk with meaningful content.',
          tokenCount: 8,
          characterCount: 50,
          startIndex: 0,
          endIndex: 50,
          metadata: { docId: 'doc-1', tenantId: 'tenant-1' }
        }
      ];

      const result = await guard.guardChunks(chunks);
      expect(result.approved).toHaveLength(1);
      expect(result.rejected).toHaveLength(0);
      expect(result.report.approved).toBe(1);
      expect(result.report.rejected).toBe(0);
    });

    it('should reject low-quality chunks', async () => {
      const chunks = [
        {
          id: 'bad-1',
          text: 'Hi', // Too short
          tokenCount: 1,
          characterCount: 2,
          startIndex: 0,
          endIndex: 2,
          metadata: { docId: 'doc-1', tenantId: 'tenant-1' }
        }
      ];

      const result = await guard.guardChunks(chunks);
      expect(result.approved).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.report.approved).toBe(0);
      expect(result.report.rejected).toBe(1);
    });

    it('should handle mixed quality chunks', async () => {
      const chunks = [
        {
          id: 'good-1',
          text: 'This is a high-quality chunk with meaningful content.',
          tokenCount: 8,
          characterCount: 50,
          startIndex: 0,
          endIndex: 50,
          metadata: { docId: 'doc-1', tenantId: 'tenant-1' }
        },
        {
          id: 'bad-1',
          text: 'Hi', // Too short
          tokenCount: 1,
          characterCount: 2,
          startIndex: 0,
          endIndex: 2,
          metadata: { docId: 'doc-2', tenantId: 'tenant-1' }
        }
      ];

      const result = await guard.guardChunks(chunks);
      expect(result.approved).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.report.approved).toBe(1);
      expect(result.report.rejected).toBe(1);
    });

    it('should enforce rejection limits', async () => {
      // Create guard with strict limits
      const strictGuard = createIngestionGuard({
        minQualityScore: 0.8 // Higher quality threshold
      });

      const chunks = Array.from({ length: 10 }, (_, i) => ({
        id: `chunk-${i}`,
        text: i < 9 ? 'This is good content' : 'Hi', // 9 good, 1 bad
        tokenCount: i < 9 ? 5 : 1,
        characterCount: i < 9 ? 20 : 2,
        startIndex: 0,
        endIndex: i < 9 ? 20 : 2,
        metadata: { docId: `doc-${i}`, tenantId: 'tenant-1' }
      }));

      const result = await strictGuard.guardChunks(chunks);
      expect(result.approved.length + result.rejected.length).toBe(10);
    });
  });

  describe('Quality Reporting', () => {
    it('should generate quality reports', async () => {
      const chunks = [
        {
          id: 'good-1',
          text: 'High quality content here.',
          tokenCount: 5,
          characterCount: 25,
          startIndex: 0,
          endIndex: 25,
          metadata: { docId: 'doc-1', tenantId: 'tenant-1' }
        }
      ];

      const result = await guard.guardChunks(chunks);
      expect(result.report).toBeDefined();
      expect(result.report.approved).toBe(1);
      expect(result.report.rejected).toBe(0);
      expect(result.report.avgQuality).toBeGreaterThan(0);
      expect(Array.isArray(result.report.issues)).toBe(true);
    });
  });
});