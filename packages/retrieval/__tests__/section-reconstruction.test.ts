import {
  SectionReconstructionEngine,
  createSectionReconstructionEngine,
  ReconstructedSection,
  SectionReconstructionConfig
} from '../src/services/section-reconstruction.js';
import { DetectedSection } from '../src/services/section-detection.js';
import { RelatedChunkResult } from '../src/services/related-chunk-fetcher.js';
import { HybridSearchResult } from '../src/types/hybrid.js';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

describe('SectionReconstructionEngine', () => {
  let engine: SectionReconstructionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new SectionReconstructionEngine();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const engine = new SectionReconstructionEngine();

      expect(mockConsoleLog).toHaveBeenCalledWith('🏗️ SectionReconstructionEngine initialized:', {
        enabled: true,
        scoring: 'weighted_average',
        contentMerge: 'ordered'
      });

      const config = engine.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.scoringStrategy).toBe('weighted_average');
      expect(config.contentMergeStrategy).toBe('ordered');
      expect(config.deduplicateContent).toBe(true);
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<SectionReconstructionConfig> = {
        enabled: false,
        scoringStrategy: 'max',
        contentMergeStrategy: 'simple_join',
        deduplicateContent: false
      };

      const engine = new SectionReconstructionEngine(customConfig);

      const config = engine.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.scoringStrategy).toBe('max');
      expect(config.contentMergeStrategy).toBe('simple_join');
      expect(config.deduplicateContent).toBe(false);
    });
  });

  describe('reconstructSections', () => {
    it('should return empty array when disabled', () => {
      const engine = new SectionReconstructionEngine({ enabled: false });
      const detectedSections: DetectedSection[] = [];
      const relatedChunks = new Map<string, RelatedChunkResult>();

      const result = engine.reconstructSections(detectedSections, relatedChunks);

      expect(result).toEqual([]);
    });

    it('should return empty array when no detected sections', () => {
      const detectedSections: DetectedSection[] = [];
      const relatedChunks = new Map<string, RelatedChunkResult>();

      const result = engine.reconstructSections(detectedSections, relatedChunks);

      expect(result).toEqual([]);
    });

    it('should reconstruct sections with related chunks', () => {
      const detectedSection: DetectedSection = {
        sectionPath: 'block_9',
        documentId: 'doc1',
        originalChunks: [
          {
            id: 'chunk1',
            score: 0.8,
            content: 'Original content',
            payload: { sectionPath: 'block_9', docId: 'doc1' },
            searchType: 'hybrid'
          }
        ],
        confidence: 0.9,
        pattern: {
          type: 'sequential_parts',
          detectionReasons: ['missing_sequential_part']
        },
        span: {
          start: 0,
          end: 100,
          textPreview: 'Original content...'
        }
      };

      const relatedResult: RelatedChunkResult = {
        chunks: [
          {
            id: 'chunk2',
            score: 0.7,
            content: 'Related content',
            payload: { sectionPath: 'block_9/part_1', docId: 'doc1' },
            searchType: 'section_related'
          }
        ],
        completionConfidence: 0.8,
        sectionMetadata: {
          totalParts: 2,
          retrievedParts: 2,
          missingParts: [],
          queryPattern: 'block_9'
        },
        performance: {
          fetchDuration: 100,
          chunksRequested: 10,
          chunksReturned: 1
        }
      };

      const relatedChunks = new Map([['block_9', relatedResult]]);
      const detectedSections = [detectedSection];

      const result = engine.reconstructSections(detectedSections, relatedChunks);

      expect(result).toHaveLength(1);
      expect(result[0].sectionPath).toBe('block_9');
      expect(result[0].documentId).toBe('doc1');
      expect(result[0].content).toContain('Original content');
      expect(result[0].content).toContain('Related content');
      expect(result[0].originalChunks).toHaveLength(2);
    });

    it('should reconstruct sections with only original chunks when no related chunks', () => {
      const detectedSection: DetectedSection = {
        sectionPath: 'block_10',
        documentId: 'doc2',
        originalChunks: [
          {
            id: 'chunk3',
            score: 0.9,
            content: 'Complete content',
            payload: { sectionPath: 'block_10', docId: 'doc2' },
            searchType: 'hybrid'
          }
        ],
        confidence: 0.8,
        pattern: {
          type: 'single_part_table',
          detectionReasons: ['markdown_table_syntax_found']
        },
        span: {
          start: 0,
          end: 50,
          textPreview: 'Complete content...'
        }
      };

      const relatedChunks = new Map<string, RelatedChunkResult>(); // Empty map
      const detectedSections = [detectedSection];

      const result = engine.reconstructSections(detectedSections, relatedChunks);

      expect(result).toHaveLength(1);
      expect(result[0].sectionPath).toBe('block_10');
      expect(result[0].originalChunks).toHaveLength(1);
      expect(result[0].content).toBe('Complete content');
    });
  });

  describe('buildReconstructedSection', () => {
    it('should build reconstructed section from chunks', () => {
      const detected: DetectedSection = {
        sectionPath: 'block_5',
        documentId: 'doc3',
        originalChunks: [],
        confidence: 0.7,
        pattern: { type: 'partial_structure', detectionReasons: [] },
        span: { start: 0, end: 0, textPreview: '' }
      };

      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk4',
          score: 0.8,
          content: 'First part',
          payload: { sectionPath: 'block_5/part_0', docId: 'doc3', keywords: ['test'] },
          searchType: 'hybrid',
          vectorScore: 0.6,
          keywordScore: 0.7,
          fusionScore: 0.75
        },
        {
          id: 'chunk5',
          score: 0.9,
          content: 'Second part',
          payload: { sectionPath: 'block_5/part_1', docId: 'doc3', keywords: ['example'] },
          searchType: 'section_related',
          vectorScore: 0.8,
          keywordScore: 0.9,
          fusionScore: 0.85
        }
      ];

      const result = (engine as any).buildReconstructedSection(detected, chunks);

      expect(result.id).toBe('reconstructed-block_5-doc3');
      expect(result.sectionPath).toBe('block_5');
      expect(result.documentId).toBe('doc3');
      expect(result.content).toContain('First part');
      expect(result.content).toContain('Second part');
      expect(result.originalChunks).toHaveLength(2);
      expect(result.combinedScore).toBeGreaterThan(0);
      expect(result.vectorScore).toBe(0.8); // Max of vector scores
      expect(result.keywordScore).toBe(0.9); // Max of keyword scores
      expect(result.fusionScore).toBe(0.85); // Max of fusion scores
    });
  });

  describe('sortChunksForReconstruction', () => {
    it('should sort chunks by part number', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk2',
          score: 0.8,
          content: 'Part 2',
          payload: { sectionPath: 'block_1/part_2' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk0',
          score: 0.9,
          content: 'Part 0',
          payload: { sectionPath: 'block_1/part_0' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk1',
          score: 0.7,
          content: 'Part 1',
          payload: { sectionPath: 'block_1/part_1' },
          searchType: 'hybrid'
        }
      ];

      const sorted = (engine as any).sortChunksForReconstruction(chunks);

      expect(sorted[0].id).toBe('chunk0');
      expect(sorted[1].id).toBe('chunk1');
      expect(sorted[2].id).toBe('chunk2');
    });

    it('should handle base section path as part 0', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: 'Part 1',
          payload: { sectionPath: 'block_2/part_1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk0',
          score: 0.9,
          content: 'Base section',
          payload: { sectionPath: 'block_2' },
          searchType: 'hybrid'
        }
      ];

      const sorted = (engine as any).sortChunksForReconstruction(chunks);

      expect(sorted[0].id).toBe('chunk0'); // Base section treated as part 0
      expect(sorted[1].id).toBe('chunk1');
    });
  });

  describe('mergeContent', () => {
    it('should merge content with deduplication', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          content: 'Common text',
          score: 0.8,
          payload: {},
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          content: 'Common text', // Duplicate
          score: 0.7,
          payload: {},
          searchType: 'hybrid'
        },
        {
          id: 'chunk3',
          content: 'Unique text',
          score: 0.9,
          payload: {},
          searchType: 'hybrid'
        }
      ];

      const merged = (engine as any).mergeContent(chunks);

      expect(merged).toContain('Common text');
      expect(merged).toContain('Unique text');
      // Should not have duplicate "Common text"
      expect(merged.split('Common text').length - 1).toBe(1);
    });

    it('should handle empty content', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          content: '',
          score: 0.8,
          payload: {},
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          content: 'Valid content',
          score: 0.9,
          payload: {},
          searchType: 'hybrid'
        }
      ];

      const merged = (engine as any).mergeContent(chunks);

      expect(merged).toBe('Valid content');
    });
  });

  describe('combinePayloads', () => {
    it('should combine payloads with array merging', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: 'test',
          payload: {
            sectionPath: 'block_1',
            docId: 'doc1',
            keywords: ['test', 'example'],
            author: 'Author A'
          },
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          score: 0.9,
          content: 'test',
          payload: {
            sectionPath: 'block_1/part_1',
            docId: 'doc1',
            keywords: ['example', 'sample'],
            author: 'Author B'
          },
          searchType: 'hybrid'
        }
      ];

      const combined = (engine as any).combinePayloads(chunks);

      expect(combined.sectionPath).toBe('block_1'); // First chunk wins
      expect(combined.docId).toBe('doc1');
      expect(combined.keywords).toEqual(['test', 'example', 'sample']); // Merged arrays
      expect(combined.author).toBe('Author A'); // First one wins for non-arrays
    });
  });

  describe('calculateCombinedScore', () => {
    it('should calculate average score', () => {
      const engine = new SectionReconstructionEngine({ scoringStrategy: 'average' });
      const chunks: HybridSearchResult[] = [
        { id: '1', score: 0.8, content: '', payload: {}, searchType: 'hybrid' },
        { id: '2', score: 0.6, content: '', payload: {}, searchType: 'hybrid' },
        { id: '3', score: 0.9, content: '', payload: {}, searchType: 'hybrid' }
      ];

      const score = (engine as any).calculateCombinedScore(chunks);

      expect(score).toBe((0.8 + 0.6 + 0.9) / 3);
    });

    it('should calculate max score', () => {
      const engine = new SectionReconstructionEngine({ scoringStrategy: 'max' });
      const chunks: HybridSearchResult[] = [
        { id: '1', score: 0.8, content: '', payload: {}, searchType: 'hybrid' },
        { id: '2', score: 0.6, content: '', payload: {}, searchType: 'hybrid' },
        { id: '3', score: 0.9, content: '', payload: {}, searchType: 'hybrid' }
      ];

      const score = (engine as any).calculateCombinedScore(chunks);

      expect(score).toBe(0.9);
    });

    it('should calculate min score', () => {
      const engine = new SectionReconstructionEngine({ scoringStrategy: 'min' });
      const chunks: HybridSearchResult[] = [
        { id: '1', score: 0.8, content: '', payload: {}, searchType: 'hybrid' },
        { id: '2', score: 0.6, content: '', payload: {}, searchType: 'hybrid' },
        { id: '3', score: 0.9, content: '', payload: {}, searchType: 'hybrid' }
      ];

      const score = (engine as any).calculateCombinedScore(chunks);

      expect(score).toBe(0.6);
    });

    it('should calculate weighted average score', () => {
      const engine = new SectionReconstructionEngine({ scoringStrategy: 'weighted_average' });
      const chunks: HybridSearchResult[] = [
        { id: '1', score: 0.8, rank: 1, content: '', payload: {}, searchType: 'hybrid' },
        { id: '2', score: 0.6, rank: 2, content: '', payload: {}, searchType: 'hybrid' }
      ];

      const score = (engine as any).calculateCombinedScore(chunks);

      // Weighted average: (0.8 * 1/1 + 0.6 * 1/2) / (1/1 + 1/2)
      const expected = (0.8 * 1 + 0.6 * 0.5) / (1 + 0.5);
      expect(score).toBe(expected);
    });
  });

  describe('identifyRepresentativeScores', () => {
    it('should return max scores from chunks', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: '1',
          score: 0.8,
          content: '',
          payload: {},
          searchType: 'hybrid',
          vectorScore: 0.6,
          keywordScore: 0.7,
          fusionScore: 0.75
        },
        {
          id: '2',
          score: 0.9,
          content: '',
          payload: {},
          searchType: 'hybrid',
          vectorScore: 0.8,
          keywordScore: 0.9,
          fusionScore: 0.85
        }
      ];

      const scores = (engine as any).identifyRepresentativeScores(chunks);

      expect(scores.vectorScore).toBe(0.8);
      expect(scores.keywordScore).toBe(0.9);
      expect(scores.fusionScore).toBe(0.85);
    });

    it('should handle undefined scores', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: '1',
          score: 0.8,
          content: '',
          payload: {},
          searchType: 'hybrid'
          // No individual scores
        }
      ];

      const scores = (engine as any).identifyRepresentativeScores(chunks);

      expect(scores.vectorScore).toBeUndefined();
      expect(scores.keywordScore).toBeUndefined();
      expect(scores.fusionScore).toBeUndefined();
    });
  });

  describe('updateConfig and getConfig', () => {
    it('should update configuration', () => {
      const newConfig: Partial<SectionReconstructionConfig> = {
        enabled: false,
        scoringStrategy: 'max'
      };

      engine.updateConfig(newConfig);

      const config = engine.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.scoringStrategy).toBe('max');
      expect(config.contentMergeStrategy).toBe('ordered'); // Unchanged
    });

    it('should return current configuration', () => {
      const config = engine.getConfig();

      expect(config).toEqual({
        enabled: true,
        scoringStrategy: 'weighted_average',
        contentMergeStrategy: 'ordered',
        deduplicateContent: true
      });
    });
  });

  describe('createSectionReconstructionEngine', () => {
    it('should create engine with default config', () => {
      const engine = createSectionReconstructionEngine();

      expect(engine).toBeInstanceOf(SectionReconstructionEngine);
      const config = engine.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('should create engine with custom config', () => {
      const customConfig: Partial<SectionReconstructionConfig> = {
        enabled: false,
        scoringStrategy: 'min'
      };

      const engine = createSectionReconstructionEngine(customConfig);

      expect(engine).toBeInstanceOf(SectionReconstructionEngine);
      const config = engine.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.scoringStrategy).toBe('min');
    });
  });
});