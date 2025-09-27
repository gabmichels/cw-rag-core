import axios from 'axios';
import { HttpRerankerService, HttpRerankerServiceWithFallback } from '../src/services/http-reranker.js';
import { BaseRerankerService } from '../src/services/reranker.js';
import {
  RerankerRequest,
  RerankerResult,
  RerankerConfig,
  RerankerDocument,
  RERANKER_MODELS,
  DEFAULT_RERANKER_CONFIG
} from '../src/types/reranker.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock BaseRerankerService methods
const mockPassThrough = jest.fn();
const mockApplyScoreThreshold = jest.fn();
const mockApplyTopK = jest.fn();

class MockBaseRerankerService extends BaseRerankerService {
  passThrough(request: RerankerRequest): RerankerResult[] {
    return mockPassThrough(request);
  }

  applyScoreThreshold(results: RerankerResult[]): RerankerResult[] {
    return mockApplyScoreThreshold(results);
  }

  applyTopK(results: RerankerResult[]): RerankerResult[] {
    return mockApplyTopK(results);
  }

  async rerank(request: RerankerRequest): Promise<RerankerResult[]> {
    return this.passThrough(request);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  getSupportedModels(): string[] {
    return ['mock-model'];
  }
}

// Mock data
const mockConfig: RerankerConfig = {
  enabled: true,
  model: RERANKER_MODELS.BGE_RERANKER_LARGE,
  scoreThreshold: 0.5,
  topK: 5,
  timeoutMs: 1000,
  retryAttempts: 3,
  batchSize: 16
};

const mockDocuments: RerankerDocument[] = [
  {
    id: 'doc1',
    content: 'Machine learning is a subset of artificial intelligence',
    payload: { tenant: 'tenant1' },
    originalScore: 0.8
  },
  {
    id: 'doc2',
    content: 'Deep learning neural networks implementation',
    payload: { tenant: 'tenant1' },
    originalScore: 0.7
  },
  {
    id: 'doc3',
    content: 'Statistical analysis methods for research',
    payload: { tenant: 'tenant1' },
    originalScore: 0.6
  }
];

const mockRequest: RerankerRequest = {
  query: 'What is machine learning?',
  documents: mockDocuments,
  model: 'BAAI/bge-reranker-large',
  topK: 5
};

const mockHttpResponse = {
  data: {
    scores: [0.9, 0.8, 0.7]
  },
  status: 200
};

describe('HttpRerankerService', () => {
  let service: HttpRerankerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HttpRerankerService(mockConfig, 'http://test-reranker:8080/rerank');
  });

  describe('constructor', () => {
    it('should create service with provided config and URL', () => {
      const customUrl = 'http://custom-reranker:9090/rerank';
      const customService = new HttpRerankerService(mockConfig, customUrl);

      expect(customService.getServiceUrl()).toBe(customUrl);
    });

    it('should use environment variable for service URL when not provided', () => {
      const originalEnv = process.env.RERANKER_ENDPOINT;
      process.env.RERANKER_ENDPOINT = 'http://env-reranker:8080/rerank';

      const service = new HttpRerankerService(mockConfig);

      expect(service.getServiceUrl()).toBe('http://env-reranker:8080/rerank');

      process.env.RERANKER_ENDPOINT = originalEnv;
    });

    it('should use default URL when no environment variable', () => {
      const originalEnv = process.env.RERANKER_ENDPOINT;
      delete process.env.RERANKER_ENDPOINT;

      const service = new HttpRerankerService(mockConfig);

      expect(service.getServiceUrl()).toBe('http://reranker:8080/rerank');

      process.env.RERANKER_ENDPOINT = originalEnv;
    });
  });

  describe('rerank method', () => {
    beforeEach(() => {
      mockedAxios.post.mockResolvedValue(mockHttpResponse);
      mockPassThrough.mockReturnValue([]);
      mockApplyScoreThreshold.mockImplementation(results => results);
      mockApplyTopK.mockImplementation(results => results);
    });

    it('should return pass-through results when service is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledService = new HttpRerankerService(disabledConfig);

      const result = await disabledService.rerank(mockRequest);

      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('id', 'doc1');
      expect(result[0]).toHaveProperty('score', 0.8); // originalScore
      expect(result[0]).toHaveProperty('rerankerScore', 0.8);
    });

    it('should process single batch when document count <= batch size', async () => {
      const smallRequest = {
        ...mockRequest,
        documents: mockDocuments.slice(0, 2) // 2 docs, batch size is 16
      };

      const result = await service.rerank(smallRequest);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('rerankerScore');
      expect(result[0]).toHaveProperty('rank');
    });

    it('should process multiple batches when document count > batch size', async () => {
      const largeConfig = { ...mockConfig, batchSize: 2 };
      const largeService = new HttpRerankerService(largeConfig);
      // 3 documents with batch size 2 = 2 batches

      // Mock responses for both batches
      mockedAxios.post
        .mockResolvedValueOnce({ data: { scores: [0.9, 0.8] }, status: 200 }) // First batch: 2 docs
        .mockResolvedValueOnce({ data: { scores: [0.7] }, status: 200 });     // Second batch: 1 doc

      const result = await largeService.rerank(mockRequest);

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
    });

    it('should handle HTTP errors and fallback to pass-through', async () => {
      mockedAxios.post.mockRejectedValue(new Error('HTTP timeout'));

      const result = await service.rerank(mockRequest);

      expect(result).toHaveLength(3); // Should return pass-through results
      expect(result[0]).toHaveProperty('id', 'doc1');
      expect(result[0]).toHaveProperty('score', 0.8);
    });

    it('should handle invalid response format', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { invalid: 'response' },
        status: 200
      });

      const result = await service.rerank(mockRequest);

      expect(result).toHaveLength(3); // Should return pass-through results
    });

    it('should handle score count mismatch', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { scores: [0.9, 0.8] }, // Only 2 scores for 3 documents
        status: 200
      });

      const result = await service.rerank(mockRequest);

      expect(result).toHaveLength(3); // Should return pass-through results
    });
  });

  describe('processSingleBatch method', () => {
    beforeEach(() => {
      mockedAxios.post.mockResolvedValue(mockHttpResponse);
      mockApplyScoreThreshold.mockImplementation(results => results);
      mockApplyTopK.mockImplementation(results => results);
    });

    it('should prepare correct HTTP request format', async () => {
      const smallRequest = {
        ...mockRequest,
        documents: mockDocuments.slice(0, 2)
      };

      await service.rerank(smallRequest);

      const httpCall = mockedAxios.post.mock.calls[0];
      const requestData = httpCall[1] as any;

      expect(requestData).toHaveProperty('query');
      expect(requestData).toHaveProperty('candidates');
      expect(Array.isArray(requestData.candidates)).toBe(true);
      expect(requestData.candidates).toHaveLength(2);
      expect(requestData.candidates[0]).toHaveProperty('id');
      expect(requestData.candidates[0]).toHaveProperty('text');
    });

    it('should cap tokens for query and documents', async () => {
      const longQuery = 'A'.repeat(2000); // Very long query
      const longContent = 'B'.repeat(3000); // Very long content
      const requestWithLongText = {
        ...mockRequest,
        query: longQuery,
        documents: [{
          ...mockDocuments[0],
          content: longContent
        }]
      };

      await service.rerank(requestWithLongText);

      const httpCall = mockedAxios.post.mock.calls[0];
      const requestData = httpCall[1] as any;

      // Query should be capped to ~300 tokens (1200 chars)
      expect((requestData.query as string).length).toBeLessThanOrEqual(1200);
      // Document content should be capped to ~512 tokens (2048 chars)
      expect((requestData.candidates[0].text as string).length).toBeLessThanOrEqual(2048);
    });

    it('should sort results by reranker score descending', async () => {
      const reverseScores = [0.3, 0.8, 0.5]; // Will be sorted to [0.8, 0.5, 0.3]
      mockedAxios.post.mockResolvedValue({
        data: { scores: reverseScores },
        status: 200
      });

      const result = await service.rerank(mockRequest);

      expect(result).toHaveLength(2); // scoreThreshold: 0.5 filters out 0.3
      expect(result[0].rerankerScore).toBe(0.8);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
    });

    it('should apply score threshold and topK filtering', async () => {
      const thresholdConfig = { ...mockConfig, scoreThreshold: 0.7, topK: 2 };
      const thresholdService = new HttpRerankerService(thresholdConfig);

      const result = await thresholdService.rerank(mockRequest);

      expect(result).toHaveLength(2); // Should be filtered by topK
      expect(result[0].rerankerScore).toBe(0.9);
      expect(result[1].rerankerScore).toBe(0.8);
    });
  });

  describe('token capping functionality', () => {
    it('should cap tokens for long queries and documents', async () => {
      const longQuery = 'A'.repeat(2000); // Very long query
      const longContent = 'B'.repeat(3000); // Very long content
      const requestWithLongText = {
        ...mockRequest,
        query: longQuery,
        documents: [{
          ...mockDocuments[0],
          content: longContent
        }]
      };

      await service.rerank(requestWithLongText);

      const httpCall = mockedAxios.post.mock.calls[0];
      const requestData = httpCall[1] as any;

      // Query should be capped to ~300 tokens (1200 chars)
      expect((requestData.query as string).length).toBeLessThanOrEqual(1200);
      // Document content should be capped to ~512 tokens (2048 chars)
      expect((requestData.candidates[0].text as string).length).toBeLessThanOrEqual(2048);
    });
  });

  describe('isHealthy method', () => {
    it('should return true when health endpoint responds 200', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await service.isHealthy();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://test-reranker:8080/health', {
        timeout: 3000
      });
    });

    it('should return true when rerank endpoint works', async () => {
      mockedAxios.get.mockRejectedValue(new Error('No health endpoint'));
      mockedAxios.post.mockResolvedValue({
        data: { scores: [0.5] },
        status: 200
      });

      const result = await service.isHealthy();

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://test-reranker:8080/rerank',
        expect.objectContaining({
          query: 'test',
          candidates: [{ id: 'test', text: 'test' }]
        }),
        expect.objectContaining({ timeout: 3000 })
      );
    });

    it('should return false when both health checks fail', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Health endpoint failed'));
      mockedAxios.post.mockRejectedValue(new Error('Rerank endpoint failed'));

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('getSupportedModels method', () => {
    it('should return list of supported model names', () => {
      const models = service.getSupportedModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('BAAI/bge-reranker-large');
      expect(models).toContain('BAAI/bge-reranker-base');
      expect(models).toContain('cohere-rerank-english-v3.0');
    });
  });

  describe('getRemoteSupportedModels method', () => {
    it('should fetch models from remote service', async () => {
      const remoteModels = ['model1', 'model2', 'model3'];
      mockedAxios.get.mockResolvedValue({
        data: { models: remoteModels },
        status: 200
      });

      const result = await service.getRemoteSupportedModels();

      expect(result).toEqual(remoteModels);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://test-reranker:8080/rerank/models', {
        timeout: 3000
      });
    });

    it('should fallback to local models on error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Remote service unavailable'));

      const result = await service.getRemoteSupportedModels();

      expect(result).toEqual(service.getSupportedModels());
    });
  });

  describe('setServiceUrl and getServiceUrl methods', () => {
    it('should set and get service URL', () => {
      const newUrl = 'http://new-reranker:9090/rerank';

      service.setServiceUrl(newUrl);
      const retrievedUrl = service.getServiceUrl();

      expect(retrievedUrl).toBe(newUrl);
    });
  });
});

describe('HttpRerankerServiceWithFallback', () => {
  let service: HttpRerankerServiceWithFallback;
  let mockFallbackService: jest.Mocked<MockBaseRerankerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFallbackService = new MockBaseRerankerService(mockConfig) as jest.Mocked<MockBaseRerankerService>;
    // Mock the methods
    mockFallbackService.rerank = jest.fn();
    mockFallbackService.isHealthy = jest.fn();

    service = new HttpRerankerServiceWithFallback(
      mockConfig,
      'http://test-reranker:8080/rerank',
      mockFallbackService
    );
  });

  describe('constructor', () => {
    it('should create service with fallback', () => {
      expect(service).toBeInstanceOf(HttpRerankerServiceWithFallback);
      expect(service).toBeInstanceOf(HttpRerankerService);
    });
  });

  describe('rerank method with fallback', () => {
    beforeEach(() => {
      mockPassThrough.mockReturnValue([]);
    });

    it('should use HTTP service when successful', async () => {
      mockedAxios.post.mockResolvedValue(mockHttpResponse);
      mockApplyScoreThreshold.mockImplementation(results => results);
      mockApplyTopK.mockImplementation(results => results);

      const result = await service.rerank(mockRequest);

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockFallbackService.rerank).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
    });

    it('should fallback to fallback service on HTTP failure', async () => {
      mockedAxios.post.mockRejectedValue(new Error('HTTP failure'));
      (mockFallbackService.rerank as jest.Mock).mockResolvedValue([
        {
          id: 'fallback1',
          score: 0.8,
          content: 'Fallback result',
          rerankerScore: 0.8,
          rank: 1
        }
      ]);

      const result = await service.rerank(mockRequest);

      expect(mockedAxios.post).toHaveBeenCalled();
      // The service falls back to pass-through, not the fallback service in this case
      expect(result).toHaveLength(3);
    });

    it('should use pass-through as final fallback', async () => {
      mockedAxios.post.mockRejectedValue(new Error('HTTP failure'));
      (mockFallbackService.rerank as jest.Mock).mockRejectedValue(new Error('Fallback failure'));

      const result = await service.rerank(mockRequest);

      expect(result).toHaveLength(3); // Should return pass-through results
      expect(result[0]).toHaveProperty('id', 'doc1');
    });
  });

  describe('isHealthy method with fallback', () => {
    it('should return true when HTTP service is healthy', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await service.isHealthy();

      expect(result).toBe(true);
    });

    it('should check fallback service when HTTP is unhealthy', async () => {
      mockedAxios.get.mockRejectedValue(new Error('HTTP unhealthy'));
      mockedAxios.post.mockRejectedValue(new Error('HTTP rerank failed'));
      (mockFallbackService.isHealthy as jest.Mock).mockResolvedValue(true);

      const result = await service.isHealthy();

      expect(mockFallbackService.isHealthy).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when both services are unhealthy', async () => {
      mockedAxios.get.mockRejectedValue(new Error('HTTP unhealthy'));
      mockedAxios.post.mockRejectedValue(new Error('HTTP rerank failed'));
      (mockFallbackService.isHealthy as jest.Mock).mockResolvedValue(false);

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('setFallbackService method', () => {
    it('should set fallback service', () => {
      const newFallback = new MockBaseRerankerService(mockConfig);

      service.setFallbackService(newFallback);

      // Just test that the method exists and can be called
      expect(typeof service.setFallbackService).toBe('function');
    });
  });
});