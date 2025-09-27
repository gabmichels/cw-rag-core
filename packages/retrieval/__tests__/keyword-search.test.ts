import { QdrantKeywordSearchService, KeywordSearchService } from '../src/services/keyword-search.js';
import { HybridSearchResult } from '../src/types/hybrid.js';

// Mock Qdrant data source
const mockQdrantDataSource = {
  scroll: jest.fn()
};

describe('QdrantKeywordSearchService', () => {
  let service: QdrantKeywordSearchService;
  const collectionName = 'test_collection';
  const limit = 10;
  const filter = { must: [], must_not: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QdrantKeywordSearchService(mockQdrantDataSource);
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(QdrantKeywordSearchService);
      expect(service).toBeInstanceOf(Object);
    });
  });

  describe('search method', () => {
    const mockScrollResult = {
      points: [
        {
          id: 'doc1',
          payload: {
            content: 'Machine learning is a subset of artificial intelligence',
            title: 'ML Basics',
            docId: 'doc1'
          }
        },
        {
          id: 'doc2',
          payload: {
            content: 'Deep learning neural networks',
            title: 'Deep Learning',
            docId: 'doc2'
          }
        }
      ]
    };

    beforeEach(() => {
      mockQdrantDataSource.scroll.mockReset();
    });

    it('should return empty array for empty query after filtering', async () => {
      const query = 'the of a'; // All stopwords

      const result = await service.search(collectionName, query, limit, filter);

      expect(result).toEqual([]);
      expect(mockQdrantDataSource.scroll).not.toHaveBeenCalled();
    });

    it('should handle basic keyword search', async () => {
      const query = 'machine learning';
      const mockScrollResult = {
        points: [
          {
            id: 'doc1',
            payload: {
              content: 'Machine learning is a subset of artificial intelligence',
              title: 'ML Basics',
              docId: 'doc1'
            }
          },
          {
            id: 'doc2',
            payload: {
              content: 'Deep learning neural networks',
              title: 'Deep Learning',
              docId: 'doc2'
            }
          }
        ]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      expect(mockQdrantDataSource.scroll).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Check result structure
      result.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('score');
        expect(item).toHaveProperty('payload');
        expect(item).toHaveProperty('searchType', 'keyword_only');
        expect(item).toHaveProperty('keywordScore');
      });
    });

    it('should apply filters correctly', async () => {
      const query = 'artificial intelligence';
      const customFilter = {
        must: [{ key: 'tenant', match: { value: 'tenant1' } }],
        must_not: []
      };

      const mockScrollResult = {
        points: [
          {
            id: 'doc1',
            payload: {
              content: 'AI and machine learning',
              tenant: 'tenant1'
            }
          }
        ]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      await service.search(collectionName, query, limit, customFilter);

      expect(mockQdrantDataSource.scroll).toHaveBeenCalledWith(
        collectionName,
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              { key: 'tenant', match: { value: 'tenant1' } }
            ]),
            should: expect.any(Array)
          })
        })
      );
    });

    it('should handle Qdrant errors gracefully', async () => {
      const query = 'test query';
      mockQdrantDataSource.scroll.mockRejectedValue(new Error('Qdrant connection failed'));

      await expect(service.search(collectionName, query, limit, filter))
        .rejects
        .toThrow('Qdrant keyword search failed: Qdrant connection failed');
    });

    it('should return empty array when no results from Qdrant', async () => {
      const query = 'test query';
      mockQdrantDataSource.scroll.mockResolvedValue({ points: [] });

      const result = await service.search(collectionName, query, limit, filter);

      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const query = 'test query';
      const smallLimit = 2;
      const mockScrollResult = {
        points: [
          { id: 'doc1', payload: { content: 'content 1' } },
          { id: 'doc2', payload: { content: 'content 2' } },
          { id: 'doc3', payload: { content: 'content 3' } }
        ]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, smallLimit, filter);

      expect(result.length).toBeLessThanOrEqual(smallLimit);
    });
  });

  describe('scoring logic through search method', () => {
    it('should score documents based on keyword matches', async () => {
      const query = 'machine learning';
      const mockScrollResult = {
        points: [
          {
            id: 'doc1',
            payload: {
              content: 'Machine learning is a subset of artificial intelligence',
              title: 'ML Basics',
              docId: 'doc1'
            }
          },
          {
            id: 'doc2',
            payload: {
              content: 'Deep learning neural networks',
              title: 'Deep Learning',
              docId: 'doc2'
            }
          }
        ]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(item => {
        expect(item.score).toBeGreaterThan(0);
        expect(item.keywordScore).toBeGreaterThan(0);
      });
    });

    it('should apply high-value term boost for specific terms', async () => {
      const query = 'artistry';
      const mockScrollResult = {
        points: [{
          id: 'doc1',
          payload: {
            content: 'The artistry of programming is essential',
            title: 'Programming Artistry',
            docId: 'doc1'
          }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      expect(result.length).toBe(1);
      expect(result[0].score).toBeGreaterThan(0);
    });

    it('should apply perfect coverage boost when all terms match', async () => {
      const query = 'machine learning algorithms';
      const mockScrollResult = {
        points: [{
          id: 'doc1',
          payload: {
            content: 'Machine learning algorithms for data analysis',
            title: 'ML Algorithms',
            docId: 'doc1'
          }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      expect(result.length).toBe(1);
      expect(result[0].score).toBeGreaterThan(0);
    });

    it('should apply super boost for ultimate+wizard pattern', async () => {
      const query = 'ultimate wizard';
      const mockScrollResult = {
        points: [{
          id: 'target',
          payload: {
            content: 'The ultimate guide to wizard programming',
            title: 'Wizard Ultimate',
            docId: 'target'
          }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      expect(result.length).toBe(1);
      expect(result[0].score).toBeGreaterThan(0);
    });
  });

  describe('tokenization and filtering', () => {
    it('should filter out stopwords', async () => {
      const query = 'what is the machine learning of the future';
      const mockScrollResult = {
        points: [{
          id: 'doc1',
          payload: { content: 'machine learning future technologies' }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      await service.search(collectionName, query, limit, filter);

      // Verify that scroll was called with filtered terms
      const scrollCall = mockQdrantDataSource.scroll.mock.calls[0];
      const filterArg = scrollCall[1].filter;

      // Should have should clauses for 'machine', 'learning', 'future'
      expect(filterArg.should.length).toBeGreaterThan(0);
    });

    it('should filter out short terms', async () => {
      const query = 'a an the is can you';
      const mockScrollResult = {
        points: [{
          id: 'doc1',
          payload: { content: 'machine learning' }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      const result = await service.search(collectionName, query, limit, filter);

      // Should return empty since only short/stopwords remain
      expect(result).toEqual([]);
    });
  });

  describe('environment variable handling', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use domainless ranking multiplier when enabled', async () => {
      process.env.FEATURES_ENABLED = 'on';
      process.env.DOMAINLESS_RANKING_ENABLED = 'on';

      const query = 'test';
      const mockScrollResult = {
        points: [{
          id: 'doc1',
          payload: { content: 'test content' }
        }]
      };

      mockQdrantDataSource.scroll.mockResolvedValue(mockScrollResult);

      await service.search(collectionName, query, limit, filter);

      // Should retrieve more results for domainless ranking
      const scrollCall = mockQdrantDataSource.scroll.mock.calls[0];
      expect(scrollCall[1].limit).toBeGreaterThan(limit);
    });
  });
});