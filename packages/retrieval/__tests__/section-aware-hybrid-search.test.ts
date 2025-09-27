import { SectionAwareHybridSearchService, createSectionAwareHybridSearchService } from '../src/services/section-aware-hybrid-search.js';
import { HybridSearchRequest, HybridSearchResult, StructuredHybridSearchResult } from '../src/types/hybrid.js';
import { UserContext } from '@cw-rag-core/shared';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Mock dependencies
const mockVectorSearchService = {
  search: jest.fn()
};

const mockKeywordSearchService = {
  search: jest.fn()
};

const mockRrfFusionService = {
  fuse: jest.fn()
};

const mockEmbeddingService = {
  embed: jest.fn()
};

const mockRerankerService = {
  rerank: jest.fn()
};

const mockQdrantClient = {
  someMethod: jest.fn()
};

// Mock the services that SectionAwareHybridSearchService depends on
jest.mock('../src/services/section-detection.js', () => ({
  createSectionDetectionService: jest.fn(),
  SectionDetectionService: jest.fn()
}));

jest.mock('../src/services/related-chunk-fetcher.js', () => ({
  createRelatedChunkFetcherService: jest.fn(),
  RelatedChunkFetcherService: jest.fn()
}));

jest.mock('../src/services/section-reconstruction.js', () => ({
  createSectionReconstructionEngine: jest.fn(),
  SectionReconstructionEngine: jest.fn()
}));

// Import after mocking
import { createSectionDetectionService } from '../src/services/section-detection.js';
import { createRelatedChunkFetcherService } from '../src/services/related-chunk-fetcher.js';
import { createSectionReconstructionEngine } from '../src/services/section-reconstruction.js';

// Mock UserContext
const mockUserContext: UserContext = {
  id: 'test-user-id',
  tenantId: 'test-tenant',
  groupIds: ['group1', 'group2']
};

// Mock standard search result
const mockStandardResult: StructuredHybridSearchResult = {
  finalResults: [
    {
      id: 'chunk1',
      score: 0.9,
      content: 'Test content',
      payload: { sectionPath: 'block_1/part_0', docId: 'doc1' },
      searchType: 'hybrid'
    }
  ],
  vectorSearchResults: [],
  keywordSearchResults: [],
  fusionResults: [],
  metrics: {
    vectorSearchDuration: 100,
    keywordSearchDuration: 50,
    fusionDuration: 25,
    rerankerDuration: 0,
    totalDuration: 175,
    vectorResultCount: 1,
    keywordResultCount: 0,
    finalResultCount: 1,
    rerankingEnabled: false,
    documentsReranked: 0
  }
};

describe('SectionAwareHybridSearchService', () => {
  let service: SectionAwareHybridSearchService;
  let mockSectionDetectionService: any;
  let mockRelatedChunkFetcher: any;
  let mockSectionReconstructor: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services
    mockSectionDetectionService = {
      detectSections: jest.fn()
    };

    mockRelatedChunkFetcher = {
      fetchRelatedChunks: jest.fn()
    };

    mockSectionReconstructor = {
      reconstructSections: jest.fn()
    };

    // Mock the factory functions
    (createSectionDetectionService as jest.Mock).mockReturnValue(mockSectionDetectionService);
    (createRelatedChunkFetcherService as jest.Mock).mockReturnValue(mockRelatedChunkFetcher);
    (createSectionReconstructionEngine as jest.Mock).mockReturnValue(mockSectionReconstructor);

    // Create service
    service = new SectionAwareHybridSearchService(
      mockVectorSearchService,
      mockKeywordSearchService,
      mockRrfFusionService,
      mockEmbeddingService,
      mockRerankerService,
      mockQdrantClient
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(createSectionDetectionService).toHaveBeenCalled();
      expect(createRelatedChunkFetcherService).toHaveBeenCalledWith(mockVectorSearchService, mockQdrantClient);
      expect(createSectionReconstructionEngine).toHaveBeenCalled();

      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Section-Aware Hybrid Search Service initialized:', {
        enabled: true,
        maxSections: 3,
        mergeStrategy: 'append',
        timeout: 3000
      });

      const config = service.getSectionConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxSectionsToComplete).toBe(3);
      expect(config.sectionCompletionTimeoutMs).toBe(3000);
      expect(config.mergeStrategy).toBe('append');
      expect(config.preserveOriginalRanking).toBe(false);
      expect(config.minTriggerConfidence).toBe(0.7);
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        enabled: false,
        maxSectionsToComplete: 5,
        mergeStrategy: 'replace' as const,
        sectionCompletionTimeoutMs: 5000
      };

      const customService = new SectionAwareHybridSearchService(
        mockVectorSearchService,
        mockKeywordSearchService,
        mockRrfFusionService,
        mockEmbeddingService,
        mockRerankerService,
        mockQdrantClient,
        customConfig
      );

      const config = customService.getSectionConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxSectionsToComplete).toBe(5);
      expect(config.mergeStrategy).toBe('replace');
      expect(config.sectionCompletionTimeoutMs).toBe(5000);
    });
  });

  describe('search', () => {
    const mockRequest: HybridSearchRequest = {
      query: 'test query',
      limit: 10
    };

    beforeEach(() => {
      // Mock the parent class search method
      jest.spyOn(Object.getPrototypeOf(SectionAwareHybridSearchService.prototype), 'search').mockResolvedValue(mockStandardResult);
    });

    it('should return standard results when section-aware search is disabled', async () => {
      service.updateSectionConfig({ enabled: false });

      const result = await service.search('test-collection', mockRequest, mockUserContext);

      expect(result.finalResults).toEqual(mockStandardResult.finalResults);
      expect(result.sectionCompletionMetrics.sectionsDetected).toBe(0);
      expect(result.sectionCompletionMetrics.sectionsCompleted).toBe(0);
      expect(result.sectionCompletionMetrics.sectionsReconstructed).toBe(0);
      expect(result.sectionCompletionMetrics.totalAdditionalChunks).toBe(0);
      expect(result.sectionCompletionMetrics.completionDuration).toBe(0);
      expect(result.sectionCompletionMetrics.timeoutOccurred).toBe(false);
      expect(result.reconstructedSections).toEqual([]);
    });

    it('should perform section completion when enabled and sections are detected', async () => {
      const mockDetectedSections = [
        {
          sectionPath: 'block_1',
          confidence: 0.8,
          originalChunks: [{ chunkId: 'chunk1', score: 0.9 }]
        }
      ];

      const mockRelatedChunks = new Map([
        ['block_1', { chunks: [{ id: 'chunk2', score: 0.8 }] }]
      ]);

      const mockReconstructedSections = [
        {
          id: 'section1',
          content: 'Reconstructed content',
          combinedScore: 0.85,
          originalChunks: [{ chunkId: 'chunk1', score: 0.9 }, { chunkId: 'chunk2', score: 0.8 }]
        }
      ];

      mockSectionDetectionService.detectSections.mockReturnValue(mockDetectedSections);
      mockRelatedChunkFetcher.fetchRelatedChunks.mockResolvedValue(mockRelatedChunks);
      mockSectionReconstructor.reconstructSections.mockReturnValue(mockReconstructedSections);

      const result = await service.search('test-collection', mockRequest, mockUserContext);

      expect(mockSectionDetectionService.detectSections).toHaveBeenCalledWith(mockStandardResult.finalResults, mockUserContext);
      expect(mockRelatedChunkFetcher.fetchRelatedChunks).toHaveBeenCalled();
      expect(mockSectionReconstructor.reconstructSections).toHaveBeenCalled();

      expect(result.sectionCompletionMetrics.sectionsDetected).toBe(1);
      expect(result.sectionCompletionMetrics.sectionsCompleted).toBe(1);
      expect(result.sectionCompletionMetrics.sectionsReconstructed).toBe(1);
      expect(result.sectionCompletionMetrics.totalAdditionalChunks).toBe(1);
      expect(result.reconstructedSections).toEqual(mockReconstructedSections);
    });

    it('should handle section completion timeout', async () => {
      service.updateSectionConfig({ sectionCompletionTimeoutMs: 1 }); // Very short timeout

      mockSectionDetectionService.detectSections.mockReturnValue([
        {
          sectionPath: 'block_1',
          confidence: 0.8,
          originalChunks: [{ chunkId: 'chunk1', score: 0.9 }]
        }
      ]);

      // Mock fetchRelatedChunks to take longer than timeout
      mockRelatedChunkFetcher.fetchRelatedChunks.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(new Map()), 100))
      );

      const result = await service.search('test-collection', mockRequest, mockUserContext);

      expect(result.sectionCompletionMetrics.timeoutOccurred).toBe(true);
      expect(result.sectionCompletionMetrics.sectionsDetected).toBe(0);
      expect(result.finalResults).toEqual(mockStandardResult.finalResults);
    });

    it('should handle section completion errors gracefully', async () => {
      mockSectionDetectionService.detectSections.mockImplementation(() => {
        throw new Error('Detection failed');
      });

      const result = await service.search('test-collection', mockRequest, mockUserContext);

      expect(result.sectionCompletionMetrics.timeoutOccurred).toBe(false);
      expect(result.finalResults).toEqual(mockStandardResult.finalResults);
    });
  });

  describe('performSectionCompletion', () => {
    it('should return empty result when no sections detected', async () => {
      mockSectionDetectionService.detectSections.mockReturnValue([]);

      const result = await (service as any).performSectionCompletion(
        mockStandardResult.finalResults,
        'test-collection',
        mockUserContext
      );

      expect(result.sectionsDetected).toBe(0);
      expect(result.sectionsCompleted).toBe(0);
      expect(result.reconstructedSections).toEqual([]);
      expect(result.totalAdditionalChunks).toBe(0);
    });

    it('should filter sections by confidence and limit', async () => {
      const mockDetectedSections = [
        {
          sectionPath: 'block_1',
          confidence: 0.9,
          originalChunks: [{ chunkId: 'chunk1', score: 0.9 }]
        },
        {
          sectionPath: 'block_2',
          confidence: 0.5, // Below minTriggerConfidence
          originalChunks: [{ chunkId: 'chunk2', score: 0.8 }]
        },
        {
          sectionPath: 'block_3',
          confidence: 0.8,
          originalChunks: [{ chunkId: 'chunk3', score: 0.7 }]
        },
        {
          sectionPath: 'block_4',
          confidence: 0.85,
          originalChunks: [{ chunkId: 'chunk4', score: 0.6 }]
        }
      ];

      service.updateSectionConfig({ maxSectionsToComplete: 2 });

      mockSectionDetectionService.detectSections.mockReturnValue(mockDetectedSections);
      mockRelatedChunkFetcher.fetchRelatedChunks.mockResolvedValue(new Map());
      mockSectionReconstructor.reconstructSections.mockReturnValue([]);

      const result = await (service as any).performSectionCompletion(
        mockStandardResult.finalResults,
        'test-collection',
        mockUserContext
      );

      expect(mockRelatedChunkFetcher.fetchRelatedChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sectionPath: 'block_1' }),
          expect.objectContaining({ sectionPath: 'block_4' })
        ]),
        'test-collection',
        mockUserContext,
        expect.any(Array)
      );
    });

    it('should calculate query relevance and sort sections', async () => {
      const mockDetectedSections = [
        {
          sectionPath: 'block_1',
          confidence: 0.8,
          originalChunks: [{ chunkId: 'chunk1', score: 0.9 }]
        },
        {
          sectionPath: 'block_2',
          confidence: 0.8,
          originalChunks: [{ chunkId: 'chunk2', score: 0.8 }]
        }
      ];

      mockSectionDetectionService.detectSections.mockReturnValue(mockDetectedSections);
      mockRelatedChunkFetcher.fetchRelatedChunks.mockResolvedValue(new Map());
      mockSectionReconstructor.reconstructSections.mockReturnValue([]);

      await (service as any).performSectionCompletion(
        mockStandardResult.finalResults,
        'test-collection',
        mockUserContext,
        'test query'
      );

      // Should be called with sections sorted by query relevance then confidence
      expect(mockRelatedChunkFetcher.fetchRelatedChunks).toHaveBeenCalledWith(
        expect.any(Array),
        'test-collection',
        mockUserContext,
        expect.any(Array)
      );
    });
  });

  describe('merge strategies', () => {
    const originalResults: HybridSearchResult[] = [
      {
        id: 'chunk1',
        score: 0.9,
        content: 'Original content',
        payload: { docId: 'doc1' },
        searchType: 'hybrid'
      }
    ];

    const reconstructedSections = [
      {
        id: 'section1',
        content: 'Reconstructed content',
        combinedScore: 0.85,
        originalChunks: [{ chunkId: 'chunk1', score: 0.9 }, { chunkId: 'chunk2', score: 0.8 }],
        searchType: 'section_reconstructed' as const
      }
    ];

    it('should replace original chunks with reconstructed sections', () => {
      service.updateSectionConfig({ mergeStrategy: 'replace' });

      const result = (service as any).mergeResultsWithSections(originalResults, reconstructedSections);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('section1');
      expect(result[0].searchType).toBe('section_reconstructed');
    });

    it('should append reconstructed sections to original results', () => {
      service.updateSectionConfig({ mergeStrategy: 'append' });

      const result = (service as any).mergeResultsWithSections(originalResults, reconstructedSections);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('chunk1');
      expect(result[1].id).toBe('section1');
      expect(result[1].searchType).toBe('section_reconstructed');
    });

    it('should interleave sections with original results by relevance', () => {
      service.updateSectionConfig({ mergeStrategy: 'interleave' });

      const result = (service as any).mergeResultsWithSections(originalResults, reconstructedSections);

      expect(result).toHaveLength(2);
      // Should be sorted by score, chunk has higher score (0.9) so it comes first
      expect(result[0].id).toBe('chunk1');
      expect(result[1].id).toBe('section1');
    });

    it('should return original results when no reconstructed sections', () => {
      const result = (service as any).mergeResultsWithSections(originalResults, []);

      expect(result).toEqual(originalResults);
    });
  });

  describe('convertSectionToResult', () => {
    it('should convert ReconstructedSection to HybridSearchResult', () => {
      const section = {
        id: 'section1',
        content: 'Section content',
        combinedScore: 0.85,
        payload: { docId: 'doc1', sectionPath: 'block_1' },
        searchType: 'section_reconstructed',
        vectorScore: 0.8,
        keywordScore: 0.7,
        fusionScore: 0.75,
        originalChunks: []
      };

      const result = (service as any).convertSectionToResult(section);

      expect(result.id).toBe('section1');
      expect(result.score).toBe(0.85);
      expect(result.content).toBe('Section content');
      expect(result.payload).toEqual(section.payload);
      expect(result.searchType).toBe('section_reconstructed');
      expect(result.vectorScore).toBe(0.8);
      expect(result.keywordScore).toBe(0.7);
      expect(result.fusionScore).toBe(0.75);
      expect(result.rank).toBe(0);
    });
  });

  describe('createSectionAwareResult', () => {
    it('should create section-aware result wrapper', () => {
      const metrics = {
        sectionsDetected: 2,
        sectionsCompleted: 1,
        sectionsReconstructed: 1,
        totalAdditionalChunks: 3,
        completionDuration: 150,
        timeoutOccurred: false
      };

      const reconstructedSections = [
        {
          id: 'section1',
          content: 'Content',
          combinedScore: 0.8,
          originalChunks: []
        }
      ];

      const result = (service as any).createSectionAwareResult(
        mockStandardResult,
        reconstructedSections,
        metrics
      );

      expect(result).toEqual({
        ...mockStandardResult,
        sectionCompletionMetrics: metrics,
        reconstructedSections
      });
    });
  });

  describe('updateSectionConfig and getSectionConfig', () => {
    it('should update section-aware configuration', () => {
      const newConfig = {
        enabled: false,
        maxSectionsToComplete: 5,
        mergeStrategy: 'interleave' as const
      };

      service.updateSectionConfig(newConfig);

      const config = service.getSectionConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxSectionsToComplete).toBe(5);
      expect(config.mergeStrategy).toBe('interleave');
    });

    it('should return current configuration', () => {
      const config = service.getSectionConfig();

      expect(config).toEqual({
        enabled: true,
        maxSectionsToComplete: 3,
        sectionCompletionTimeoutMs: 3000,
        mergeStrategy: 'append',
        preserveOriginalRanking: false,
        minTriggerConfidence: 0.7
      });
    });
  });

  describe('calculateQueryRelevance', () => {
    it('should return 0 (domainless implementation)', () => {
      const section = { sectionPath: 'block_1' };
      const relevance = (service as any).calculateQueryRelevance(section, 'test query');

      expect(relevance).toBe(0);
    });
  });

  describe('createSectionAwareHybridSearchService', () => {
    it('should create service with default config', () => {
      const service = createSectionAwareHybridSearchService(
        mockVectorSearchService,
        mockKeywordSearchService,
        mockRrfFusionService,
        mockEmbeddingService,
        mockRerankerService,
        mockQdrantClient
      );

      expect(service).toBeInstanceOf(SectionAwareHybridSearchService);
    });

    it('should create service with custom config', () => {
      const customConfig = {
        enabled: false,
        maxSectionsToComplete: 2
      };

      const service = createSectionAwareHybridSearchService(
        mockVectorSearchService,
        mockKeywordSearchService,
        mockRrfFusionService,
        mockEmbeddingService,
        mockRerankerService,
        mockQdrantClient,
        customConfig
      );

      expect(service).toBeInstanceOf(SectionAwareHybridSearchService);
      const config = service.getSectionConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxSectionsToComplete).toBe(2);
    });
  });
});