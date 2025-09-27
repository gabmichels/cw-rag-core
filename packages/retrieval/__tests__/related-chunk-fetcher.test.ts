import { RelatedChunkFetcherService, createRelatedChunkFetcherService } from '../src/services/related-chunk-fetcher.js';
import { DetectedSection } from '../src/services/section-detection.js';
import { UserContext } from '@cw-rag-core/shared';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Mock dependencies
const mockVectorSearchService = {
  search: jest.fn()
};

const mockQdrantClient = {
  scroll: jest.fn()
};

// Mock UserContext
const mockUserContext: UserContext = {
  id: 'test-user-id',
  tenantId: 'test-tenant',
  groupIds: ['group1', 'group2']
};

// Mock DetectedSection
const mockDetectedSection: DetectedSection = {
  sectionPath: 'block_1',
  documentId: 'doc1',
  confidence: 0.8,
  originalChunks: [
    {
      id: 'chunk1',
      score: 0.9,
      content: 'Original chunk content',
      payload: { sectionPath: 'block_1/part_0', docId: 'doc1' },
      searchType: 'hybrid'
    }
  ],
  pattern: {
    type: 'sequential_parts',
    detectionReasons: ['missing_sequential_part']
  },
  span: {
    start: 0,
    end: 100,
    textPreview: 'Original chunk content...'
  }
};

// Mock Qdrant scroll result
const mockScrollResult = {
  points: [
    {
      id: 'chunk2',
      payload: {
        content: 'Related chunk content',
        sectionPath: 'block_1/part_1',
        docId: 'doc1',
        tenant: 'test-tenant',
        acl: ['group1'],
        originalScore: 0.7
      }
    },
    {
      id: 'chunk3',
      payload: {
        content: 'Another related chunk',
        sectionPath: 'block_1/part_2',
        docId: 'doc1',
        tenant: 'test-tenant',
        acl: ['group1'],
        originalScore: 0.6
      }
    }
  ]
};

describe('RelatedChunkFetcherService', () => {
  let service: RelatedChunkFetcherService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockQdrantClient.scroll.mockResolvedValue(mockScrollResult);

    service = new RelatedChunkFetcherService(
      mockVectorSearchService,
      mockQdrantClient
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(service.getConfig()).toEqual({
        enabled: true,
        maxChunksPerSection: 10,
        queryTimeoutMs: 2000,
        preserveOriginalScoring: true
      });
    });

    it('should initialize with custom config', () => {
      const customService = new RelatedChunkFetcherService(
        mockVectorSearchService,
        mockQdrantClient,
        {
          enabled: false,
          maxChunksPerSection: 5,
          queryTimeoutMs: 1000,
          preserveOriginalScoring: false
        }
      );

      expect(customService.getConfig()).toEqual({
        enabled: false,
        maxChunksPerSection: 5,
        queryTimeoutMs: 1000,
        preserveOriginalScoring: false
      });
    });
  });

  describe('fetchRelatedChunks', () => {
    it('should return empty map when service is disabled', async () => {
      service.updateConfig({ enabled: false });

      const result = await service.fetchRelatedChunks(
        [mockDetectedSection],
        'test-collection',
        mockUserContext
      );

      expect(result.size).toBe(0);
    });

    it('should return empty map when no sections provided', async () => {
      const result = await service.fetchRelatedChunks(
        [],
        'test-collection',
        mockUserContext
      );

      expect(result.size).toBe(0);
    });

    it('should fetch chunks for multiple sections successfully', async () => {
      const sections = [
        mockDetectedSection,
        {
          ...mockDetectedSection,
          sectionPath: 'block_2',
          documentId: 'doc2'
        }
      ];

      const result = await service.fetchRelatedChunks(
        sections,
        'test-collection',
        mockUserContext,
        ['chunk1'] // exclude original chunk
      );

      expect(result.size).toBe(2);
      expect(result.has('block_1')).toBe(true);
      expect(result.has('block_2')).toBe(true);

      expect(mockQdrantClient.scroll).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
    });

    it('should handle fetch errors gracefully', async () => {
      mockQdrantClient.scroll.mockRejectedValueOnce(new Error('Qdrant error'));

      const result = await service.fetchRelatedChunks(
        [mockDetectedSection],
        'test-collection',
        mockUserContext
      );

      expect(result.size).toBe(0); // Failed section not included
    });
  });

  describe('fetchSectionChunks', () => {
    it('should fetch chunks for a section successfully', async () => {
      const result = await (service as any).fetchSectionChunks(
        mockDetectedSection,
        'test-collection',
        mockUserContext,
        ['chunk1']
      );

      expect(result.chunks).toHaveLength(2);
      expect(result.completionConfidence).toBeGreaterThan(0);
      expect(result.performance.chunksRequested).toBe(10);
      expect(result.performance.chunksReturned).toBe(2);
      expect(result.performance.fetchDuration).toBeGreaterThan(0);
    });

    it('should handle query timeout', async () => {
      service.updateConfig({ queryTimeoutMs: 1 }); // Very short timeout

      // Mock a slow query
      mockQdrantClient.scroll.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockScrollResult), 100))
      );

      const result = await (service as any).fetchSectionChunks(
        mockDetectedSection,
        'test-collection',
        mockUserContext,
        []
      );

      expect(result.chunks).toHaveLength(0);
      expect(result.completionConfidence).toBe(0);
    });

    it('should handle query errors gracefully', async () => {
      mockQdrantClient.scroll.mockRejectedValue(new Error('Query failed'));

      const result = await (service as any).fetchSectionChunks(
        mockDetectedSection,
        'test-collection',
        mockUserContext,
        []
      );

      expect(result.chunks).toHaveLength(0);
      expect(result.completionConfidence).toBe(0);
      expect(result.sectionMetadata.totalParts).toBe(0);
    });
  });

  describe('executeRelatedChunkQuery', () => {
    it('should execute query and return filtered chunks', async () => {
      const query = {
        sectionPath: 'block_1',
        tenantId: 'test-tenant',
        userContext: mockUserContext,
        documentId: 'doc1',
        maxChunks: 10,
        excludeChunkIds: ['chunk1']
      };

      const result = await (service as any).executeRelatedChunkQuery('test-collection', query);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('chunk2');
      expect(result[0].searchType).toBe('section_related');
      expect(result[0].score).toBe(0.7); // preserveOriginalScoring is true
      expect(result[1].id).toBe('chunk3');
    });

    it('should handle query execution errors', async () => {
      mockQdrantClient.scroll.mockRejectedValue(new Error('Scroll failed'));

      const query = {
        sectionPath: 'block_1',
        tenantId: 'test-tenant',
        userContext: mockUserContext,
        maxChunks: 10,
        excludeChunkIds: []
      };

      await expect((service as any).executeRelatedChunkQuery('test-collection', query))
        .rejects.toThrow('Scroll failed');
    });
  });

  describe('executeSectionPathQuery', () => {
    it('should build filter and execute scroll query', async () => {
      const query = {
        sectionPath: 'block_1',
        tenantId: 'test-tenant',
        userContext: mockUserContext,
        documentId: 'doc1',
        maxChunks: 10,
        excludeChunkIds: []
      };

      const result = await (service as any).executeSectionPathQuery('test-collection', query);

      expect(mockQdrantClient.scroll).toHaveBeenCalledWith('test-collection', {
        filter: {
          must: [
            { key: 'tenant', match: { value: 'test-tenant' } },
            {
              should: [
                { key: 'acl', match: { any: ['group1', 'group2'] } },
                { key: 'acl', match: { value: 'public' } }
              ]
            },
            { key: 'docId', match: { value: 'doc1' } },
            { key: 'sectionPath', match: { text: 'block_1' } }
          ]
        },
        limit: 10,
        with_payload: true,
        with_vector: false
      });

      expect(result).toHaveLength(2);
    });

    it('should exclude specified chunk IDs', async () => {
      const query = {
        sectionPath: 'block_1',
        tenantId: 'test-tenant',
        userContext: mockUserContext,
        maxChunks: 10,
        excludeChunkIds: ['chunk2'] // Exclude chunk2
      };

      const result = await (service as any).executeSectionPathQuery('test-collection', query);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('chunk3');
    });

    it('should not preserve original scoring when disabled', async () => {
      service.updateConfig({ preserveOriginalScoring: false });

      const query = {
        sectionPath: 'block_1',
        tenantId: 'test-tenant',
        userContext: mockUserContext,
        maxChunks: 10,
        excludeChunkIds: []
      };

      const result = await (service as any).executeSectionPathQuery('test-collection', query);

      expect(result[0].score).toBe(0.8); // Default score when not preserving
      expect(result[0].fusionScore).toBe(0.8);
    });
  });

  describe('buildSectionPathFilter', () => {
    it('should build filter with tenant isolation and RBAC', () => {
      const filter = (service as any).buildSectionPathFilter(
        'block_1',
        mockUserContext,
        'doc1'
      );

      expect(filter).toEqual({
        must: [
          { key: 'tenant', match: { value: 'test-tenant' } },
          {
            should: [
              { key: 'acl', match: { any: ['group1', 'group2'] } },
              { key: 'acl', match: { value: 'public' } }
            ]
          },
          { key: 'docId', match: { value: 'doc1' } },
          { key: 'sectionPath', match: { text: 'block_1' } }
        ]
      });
    });

    it('should handle missing documentId', () => {
      const filter = (service as any).buildSectionPathFilter(
        'block_1',
        mockUserContext
      );

      expect(filter.must).toHaveLength(3); // No docId filter
      expect(filter.must[2]).toEqual({ key: 'sectionPath', match: { text: 'block_1' } });
    });
  });

  describe('analyzeSectionCompleteness', () => {
    it('should analyze completeness for simple section', () => {
      const chunks = [
        {
          id: 'chunk1',
          payload: { sectionPath: 'block_1' }
        }
      ];

      const result = (service as any).analyzeSectionCompleteness(chunks, 'block_1');

      expect(result.totalParts).toBe(2);
      expect(result.retrievedParts).toBe(1);
      expect(result.missingParts).toEqual(['part_0']);
      expect(result.queryPattern).toBe('block_1');
    });

    it('should analyze completeness for multi-part section', () => {
      const chunks = [
        {
          id: 'chunk1',
          payload: { sectionPath: 'block_1/part_0' }
        },
        {
          id: 'chunk2',
          payload: { sectionPath: 'block_1/part_2' } // Missing part_1
        }
      ];

      const result = (service as any).analyzeSectionCompleteness(chunks, 'block_1');

      expect(result.totalParts).toBe(3); // parts 0, 1, 2
      expect(result.retrievedParts).toBe(2);
      expect(result.missingParts).toEqual(['part_1']);
    });

    it('should handle chunks without sectionPath', () => {
      const chunks = [
        {
          id: 'chunk1',
          payload: {} // No sectionPath
        }
      ];

      const result = (service as any).analyzeSectionCompleteness(chunks, 'block_1');

      expect(result.totalParts).toBe(1);
      expect(result.retrievedParts).toBe(0);
      expect(result.missingParts).toEqual(['part_0']);
    });
  });

  describe('calculateCompletionConfidence', () => {
    it('should calculate confidence based on section confidence and retrieval', () => {
      const chunks = [
        { id: 'chunk1', score: 0.8 },
        { id: 'chunk2', score: 0.7 }
      ];

      const metadata = {
        totalParts: 2,
        retrievedParts: 2,
        missingParts: [],
        queryPattern: 'block_1'
      };

      const result = (service as any).calculateCompletionConfidence(
        chunks,
        mockDetectedSection,
        metadata
      );

      // Base confidence: 0.8 * 0.4 = 0.32
      // Completion ratio: 2/2 * 0.4 = 0.4
      // Chunk count boost: min(2/5, 1) * 0.2 = 0.08
      // Total: 0.32 + 0.4 + 0.08 = 0.8
      expect(result).toBe(0.8);
    });

    it('should return 0 for empty chunks', () => {
      const metadata = {
        totalParts: 0,
        retrievedParts: 0,
        missingParts: [],
        queryPattern: 'block_1'
      };

      const result = (service as any).calculateCompletionConfidence(
        [],
        mockDetectedSection,
        metadata
      );

      expect(result).toBe(0);
    });

    it('should cap confidence at 1.0', () => {
      const chunks = Array.from({ length: 10 }, (_, i) => ({ id: `chunk${i}`, score: 0.9 }));

      const metadata = {
        totalParts: 1,
        retrievedParts: 1,
        missingParts: [],
        queryPattern: 'block_1'
      };

      const highConfidenceSection = { ...mockDetectedSection, confidence: 1.0 };

      const result = (service as any).calculateCompletionConfidence(
        chunks,
        highConfidenceSection,
        metadata
      );

      expect(result).toBe(1.0);
    });
  });

  describe('updateConfig and getConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxChunksPerSection: 20,
        queryTimeoutMs: 5000
      };

      service.updateConfig(newConfig);

      const config = service.getConfig();
      expect(config.maxChunksPerSection).toBe(20);
      expect(config.queryTimeoutMs).toBe(5000);
      expect(config.enabled).toBe(true); // Unchanged
    });

    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config).toEqual({
        enabled: true,
        maxChunksPerSection: 10,
        queryTimeoutMs: 2000,
        preserveOriginalScoring: true
      });
    });
  });

  describe('createRelatedChunkFetcherService', () => {
    it('should create service with default config', () => {
      const service = createRelatedChunkFetcherService(
        mockVectorSearchService,
        mockQdrantClient
      );

      expect(service).toBeInstanceOf(RelatedChunkFetcherService);
    });

    it('should create service with custom config', () => {
      const customConfig = {
        enabled: false,
        maxChunksPerSection: 5
      };

      const service = createRelatedChunkFetcherService(
        mockVectorSearchService,
        mockQdrantClient,
        customConfig
      );

      expect(service).toBeInstanceOf(RelatedChunkFetcherService);
      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxChunksPerSection).toBe(5);
    });
  });
});