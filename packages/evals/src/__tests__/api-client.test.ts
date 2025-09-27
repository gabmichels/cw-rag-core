import {
  EvaluationAPIClient,
  APIClientConfig,
  APICallMetrics,
  createTestUserContext,
  createAskRequest
} from '../api-client.js';
import { AskRequest, AskResponse } from '@cw-rag-core/shared';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock AbortController
const mockAbortController = jest.fn().mockImplementation(() => ({
  abort: jest.fn(),
  signal: {}
}));
global.AbortController = mockAbortController;

describe('EvaluationAPIClient', () => {
  let client: EvaluationAPIClient;
  let config: APIClientConfig;
  let mockResponse: AskResponse;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      baseUrl: 'http://localhost:3000',
      timeout: 5000,
      retries: 2,
      apiKey: 'test-key'
    };

    mockResponse = {
      answer: 'Test answer',
      queryId: 'test-query-123',
      retrievedDocuments: [
        {
          document: {
            id: 'doc1',
            content: 'Test content',
            metadata: {
              tenantId: 'test-tenant',
              docId: 'doc1',
              acl: ['user1']
            }
          },
          score: 0.9
        }
      ],
      guardrailDecision: {
        isAnswerable: true,
        confidence: 0.95
      }
    };

    client = new EvaluationAPIClient(config);
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const minimalConfig = { baseUrl: 'http://localhost:3000' };
      const testClient = new EvaluationAPIClient(minimalConfig);

      expect(testClient).toBeDefined();
    });

    it('should override defaults with provided config', () => {
      expect(client).toBeDefined();
    });
  });

  describe('ask', () => {
    const mockRequest: AskRequest = {
      query: 'test query',
      userContext: {
        tenantId: 'test-tenant',
        id: 'user1',
        groupIds: ['users']
      },
      k: 5
    };

    it('should make successful API call and return response with metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const result = await client.ask(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/ask',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          },
          body: JSON.stringify(mockRequest),
          signal: expect.any(Object)
        })
      );

      expect(result.response).toEqual(mockResponse);
      expect(result.metrics).toMatchObject({
        statusCode: 200,
        retryCount: 0
      });
      expect(typeof result.metrics.duration).toBe('number');
    });

    it('should handle API errors with retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockResponse
        } as Response);

      const result = await client.ask(mockRequest);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.metrics.retryCount).toBe(2);
    });

    it('should throw error after all retries exhausted', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.ask(mockRequest)).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      // Mock all retries to fail with HTTP error
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error'
        } as Response);
      }

      await expect(client.ask(mockRequest)).rejects.toThrow('API request failed: 500 Internal Server Error - Server error');
    });

    it('should handle timeout', async () => {
      const timeoutClient = new EvaluationAPIClient({
        ...config,
        timeout: 100
      });

      mockFetch.mockImplementationOnce(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
      );

      await expect(timeoutClient.ask(mockRequest)).rejects.toThrow();
    }, 10000);

    it('should work without API key', async () => {
      const noKeyClient = new EvaluationAPIClient({
        baseUrl: 'http://localhost:3000'
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      await noKeyClient.ask(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/ask',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json'
            // No Authorization header
          }
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/healthz', {
        method: 'GET',
        signal: expect.any(Object)
      });
    });

    it('should return false for unhealthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementationOnce(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000))
      );

      const result = await client.healthCheck();

      expect(result).toBe(false);
    }, 10000);
  });

  describe('waitForReady', () => {
    it('should resolve immediately if service is ready', async () => {
      mockFetch.mockResolvedValue({ ok: true } as Response);

      const result = await client.waitForReady(1000);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should poll until service becomes ready', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false } as Response)
        .mockResolvedValueOnce({ ok: false } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);

      const result = await client.waitForReady(10000);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should timeout if service never becomes ready', async () => {
      mockFetch.mockResolvedValue({ ok: false } as Response);

      const result = await client.waitForReady(1000);

      expect(result).toBe(false);
    });
  });

  describe('metrics management', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      await client.ask({
        query: 'test',
        userContext: { tenantId: 'test', id: 'user', groupIds: [] },
        k: 1
      });
    });

    it('should track metrics', () => {
      const metrics = client.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        statusCode: 200,
        retryCount: 0
      });
    });

    it('should clear metrics', () => {
      client.clearMetrics();
      const metrics = client.getMetrics();

      expect(metrics).toHaveLength(0);
    });

    it('should calculate performance stats', () => {
      const stats = client.getPerformanceStats();

      expect(stats.totalCalls).toBe(1);
      expect(stats.successRate).toBe(1);
      expect(stats.retryRate).toBe(0);
      expect(typeof stats.averageDuration).toBe('number');
    });

    it('should handle empty metrics', () => {
      client.clearMetrics();
      const stats = client.getPerformanceStats();

      expect(stats.totalCalls).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });
});

describe('createTestUserContext', () => {
  it('should create standard user context', () => {
    const context = createTestUserContext('standard', 'test-tenant');

    expect(context.tenantId).toBe('test-tenant');
    expect(context.groupIds).toEqual(['users', 'readers']);
    expect(context.id).toMatch(/^test-user-/);
  });

  it('should create rbac_limited user context', () => {
    const context = createTestUserContext('rbac_limited', 'test-tenant');

    expect(context.groupIds).toEqual(['restricted-users']);
  });

  it('should create rbac_admin user context', () => {
    const context = createTestUserContext('rbac_admin', 'test-tenant');

    expect(context.id).toBe('admin-user');
    expect(context.groupIds).toEqual(['admins', 'users', 'readers']);
  });

  it('should create unauthorized user context', () => {
    const context = createTestUserContext('unauthorized', 'test-tenant');

    expect(context.groupIds).toEqual([]);
  });
});

describe('createAskRequest', () => {
  const userContext = {
    tenantId: 'test-tenant',
    id: 'user1',
    groupIds: ['users']
  };

  it('should create basic ask request', () => {
    const request = createAskRequest('test query', userContext);

    expect(request.query).toBe('test query');
    expect(request.userContext).toBe(userContext);
    expect(request.k).toBe(5);
    expect(request.filter).toBeUndefined();
  });

  it('should include optional parameters', () => {
    const request = createAskRequest('test query', userContext, {
      k: 10,
      filter: { category: 'test' }
    });

    expect(request.k).toBe(10);
    expect(request.filter).toEqual({ category: 'test' });
  });
});