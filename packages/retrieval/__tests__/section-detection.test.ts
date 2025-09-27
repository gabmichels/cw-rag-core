import {
  SectionDetectionService,
  createSectionDetectionService,
  DetectedSection,
  SectionDetectionConfig
} from '../src/services/section-detection.js';
import { HybridSearchResult } from '../src/types/hybrid.js';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

// Mock UserContext type
const mockUserContext = {
  id: 'test-user-id',
  tenantId: 'test-tenant',
  userId: 'test-user',
  groupIds: ['group1', 'group2']
};

describe('SectionDetectionService', () => {
  let service: SectionDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SectionDetectionService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const service = new SectionDetectionService();

      expect(mockConsoleLog).toHaveBeenCalledWith('📝 SectionDetectionService initialized:', {
        enabled: true,
        minTrigger: 1
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.minProximityScore).toBe(0.6);
      expect(config.maxSectionGapRank).toBe(3);
      expect(config.minTriggerChunkCount).toBe(1);
    });

    it('should initialize with custom config', () => {
      const customConfig: Partial<SectionDetectionConfig> = {
        enabled: false,
        minProximityScore: 0.8,
        maxSectionGapRank: 5,
        minTriggerChunkCount: 2
      };

      const service = new SectionDetectionService(customConfig);

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.minProximityScore).toBe(0.8);
      expect(config.maxSectionGapRank).toBe(5);
      expect(config.minTriggerChunkCount).toBe(2);
    });
  });

  describe('detectSections', () => {
    it('should return empty array when disabled', () => {
      const service = new SectionDetectionService({ enabled: false });
      const results: HybridSearchResult[] = [];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toEqual([]);
    });

    it('should return empty array when no results', () => {
      const results: HybridSearchResult[] = [];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toEqual([]);
    });

    it('should detect sequential parts pattern with gaps', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Part 0 content',
          payload: { sectionPath: 'block_9/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        },
        {
          id: 'chunk2',
          score: 0.8,
          content: 'Part 2 content',
          payload: { sectionPath: 'block_9/part_2', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 2
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_9');
      expect(detected[0].pattern.type).toBe('sequential_parts');
      expect(detected[0].pattern.detectionReasons).toContain('missing_sequential_part');
      expect(detected[0].confidence).toBe(0.8);
    });

    it('should detect base section with parts', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Base section',
          payload: { sectionPath: 'block_10', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        },
        {
          id: 'chunk2',
          score: 0.8,
          content: 'Part 0 content',
          payload: { sectionPath: 'block_10/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 2
        },
        {
          id: 'chunk3',
          score: 0.7,
          content: 'Part 1 content',
          payload: { sectionPath: 'block_10/part_1', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 3
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_10');
      expect(detected[0].pattern.type).toBe('sequential_parts');
      expect(detected[0].pattern.detectionReasons).toContain('base_section_and_parts_found');
      expect(detected[0].confidence).toBe(0.9);
    });

    it('should detect base section only with table syntax', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Header | Value |\n|--------|-------|\n| Data | Info |',
          payload: { sectionPath: 'block_11', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_11');
      expect(detected[0].pattern.type).toBe('sequential_parts');
      expect(detected[0].pattern.detectionReasons).toContain('base_section_only_with_table_syntax');
      expect(detected[0].confidence).toBe(0.8);
    });

    it('should detect single part 0 with table syntax', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Column1 | Column2 |\n|---------|---------|\n| Value1 | Value2 |',
          payload: { sectionPath: 'block_12/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_12');
      expect(detected[0].pattern.type).toBe('sequential_parts');
      expect(detected[0].pattern.detectionReasons).toContain('single_part_0_with_table_syntax');
      expect(detected[0].confidence).toBe(0.9);
    });

    it('should detect single part table pattern', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: '| Name | Type |\n|------|------|\n| Item | Data |',
          payload: { sectionPath: 'block_13/part_1', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_13');
      expect(detected[0].pattern.type).toBe('single_part_table');
      expect(detected[0].pattern.detectionReasons).toContain('markdown_table_syntax_found');
      expect(detected[0].confidence).toBe(0.85);
    });

    it('should detect partial structure with multiple chunks', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: 'First chunk',
          payload: { sectionPath: 'block_14/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        },
        {
          id: 'chunk2',
          score: 0.7,
          content: 'Second chunk',
          payload: { sectionPath: 'block_14/part_1', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 2
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_14');
      expect(detected[0].pattern.type).toBe('partial_structure');
      expect(detected[0].pattern.detectionReasons).toContain('multiple_chunks_from_same_base_section');
    });

    it('should detect partial structure with single chunk and table syntax', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Header | Data |\n|--------|------|\n| Row1 | Value1 |',
          payload: { sectionPath: 'block_15/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(1);
      expect(detected[0].sectionPath).toBe('block_15');
      expect(detected[0].pattern.type).toBe('sequential_parts'); // Sequential parts takes precedence
      expect(detected[0].pattern.detectionReasons).toContain('single_part_0_with_table_syntax');
    });

    it('should not detect sections below minimum trigger count', () => {
      const service = new SectionDetectionService({ minTriggerChunkCount: 2 });
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Single chunk',
          payload: { sectionPath: 'block_16/part_0', docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(0);
    });

    it('should handle results without sectionPath', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'No section path',
          payload: { docId: 'doc1' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(0);
    });

    it('should handle results without documentId', () => {
      const results: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'No doc ID',
          payload: { sectionPath: 'block_17/part_0' },
          searchType: 'hybrid',
          rank: 1
        }
      ];

      const detected = service.detectSections(results, mockUserContext);

      expect(detected).toHaveLength(0);
    });
  });

  describe('detectSequentialPartsPattern', () => {
    it('should return null for empty chunks', () => {
      const result = (service as any).detectSequentialPartsPattern([], 'block_1');
      expect(result).toBeNull();
    });

    it('should detect gaps in sequential parts', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Part 0',
          payload: { sectionPath: 'block_1/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          score: 0.8,
          content: 'Part 2',
          payload: { sectionPath: 'block_1/part_2', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSequentialPartsPattern(chunks, 'block_1');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('missing_sequential_part');
      expect(result!.confidence).toBe(0.8);
    });

    it('should detect base section with sequential parts', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Base',
          payload: { sectionPath: 'block_2', docId: 'doc1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          score: 0.8,
          content: 'Part 0',
          payload: { sectionPath: 'block_2/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk3',
          score: 0.7,
          content: 'Part 1',
          payload: { sectionPath: 'block_2/part_1', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSequentialPartsPattern(chunks, 'block_2');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('base_section_and_parts_found');
      expect(result!.confidence).toBe(0.9);
    });

    it('should detect base section only with table syntax', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Header | Value |\n|--------|-------|\n| Data | Info |',
          payload: { sectionPath: 'block_3', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSequentialPartsPattern(chunks, 'block_3');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('base_section_only_with_table_syntax');
      expect(result!.confidence).toBe(0.8);
    });

    it('should detect single part 0 with table syntax', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Col1 | Col2 |\n|------|------|\n| Val1 | Val2 |',
          payload: { sectionPath: 'block_4/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSequentialPartsPattern(chunks, 'block_4');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('single_part_0_with_table_syntax');
      expect(result!.confidence).toBe(0.9);
    });
  });

  describe('detectSinglePartTablePattern', () => {
    it('should detect markdown table syntax', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: '| Name | Value |\n|------|-------|\n| Item | Data |',
          payload: { sectionPath: 'block_5/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSinglePartTablePattern(chunks, 'block_5');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('markdown_table_syntax_found');
      expect(result!.confidence).toBe(0.85);
    });

    it('should return null when no table syntax', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: 'Regular text without table syntax',
          payload: { sectionPath: 'block_6/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectSinglePartTablePattern(chunks, 'block_6');

      expect(result).toBeNull();
    });
  });

  describe('detectPartialStructure', () => {
    it('should return null for empty chunks', () => {
      const result = (service as any).detectPartialStructure([], 'block_1');
      expect(result).toBeNull();
    });

    it('should detect multiple chunks from same base section', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.8,
          content: 'First chunk',
          payload: { sectionPath: 'block_7/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          score: 0.7,
          content: 'Second chunk',
          payload: { sectionPath: 'block_7/part_1', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectPartialStructure(chunks, 'block_7');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('multiple_chunks_from_same_base_section');
    });

    it('should detect single chunk with table syntax and good score', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: '| Header | Data |\n|--------|------|\n| Row | Info |',
          payload: { sectionPath: 'block_8/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectPartialStructure(chunks, 'block_8');

      expect(result).not.toBeNull();
      expect(result!.pattern.detectionReasons).toContain('single_chunk_with_markdown_table_syntax_and_good_score');
    });

    it('should not detect when score is below threshold', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.3, // Below minProximityScore of 0.6
          content: '| Header | Data |\n|--------|------|\n| Row | Info |',
          payload: { sectionPath: 'block_9/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).detectPartialStructure(chunks, 'block_9');

      expect(result).toBeNull();
    });
  });

  describe('createDetectedSection', () => {
    it('should create detected section object', () => {
      const chunks: HybridSearchResult[] = [
        {
          id: 'chunk1',
          score: 0.9,
          content: 'Test content',
          payload: { sectionPath: 'block_10/part_0', docId: 'doc1' },
          searchType: 'hybrid'
        },
        {
          id: 'chunk2',
          score: 0.8,
          content: 'More content',
          payload: { sectionPath: 'block_10/part_1', docId: 'doc1' },
          searchType: 'hybrid'
        }
      ];

      const result = (service as any).createDetectedSection(
        'block_10',
        'doc1',
        chunks,
        0.85,
        'partial_structure',
        ['test_reason']
      );

      expect(result.sectionPath).toBe('block_10');
      expect(result.documentId).toBe('doc1');
      expect(result.originalChunks).toBe(chunks);
      expect(result.confidence).toBe(0.85);
      expect(result.pattern.type).toBe('partial_structure');
      expect(result.pattern.detectionReasons).toEqual(['test_reason']);
      expect(result.span.textPreview).toContain('Test content');
      expect(result.span.textPreview).toContain('More content');
    });
  });

  describe('updateConfig and getConfig', () => {
    it('should update configuration', () => {
      const newConfig: Partial<SectionDetectionConfig> = {
        enabled: false,
        minProximityScore: 0.8
      };

      service.updateConfig(newConfig);

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.minProximityScore).toBe(0.8);
      expect(config.maxSectionGapRank).toBe(3); // Unchanged
    });

    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config).toEqual({
        enabled: true,
        minProximityScore: 0.6,
        maxSectionGapRank: 3,
        sectionPathRegex: /^(block_\d+)(?:\/part_\d+)?$/,
        minTriggerChunkCount: 1
      });
    });
  });

  describe('createSectionDetectionService', () => {
    it('should create service with default config', () => {
      const service = createSectionDetectionService();

      expect(service).toBeInstanceOf(SectionDetectionService);
      const config = service.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<SectionDetectionConfig> = {
        enabled: false,
        minTriggerChunkCount: 3
      };

      const service = createSectionDetectionService(customConfig);

      expect(service).toBeInstanceOf(SectionDetectionService);
      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.minTriggerChunkCount).toBe(3);
    });
  });
});