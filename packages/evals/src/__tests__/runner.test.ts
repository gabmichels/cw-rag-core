import { EvaluationRunner, RunnerConfig } from '../runner.js';
import { EvaluationAPIClient, createTestUserContext, createAskRequest } from '../api-client.js';
import {
  Dataset,
  EvaluationConfig,
  EvaluationResult,
  GoldEvalRecord,
  OODEvalRecord,
  InjectionEvalRecord,
  RBACEvalRecord
} from '../types.js';

// Mock the API client
jest.mock('../api-client.js');
const MockEvaluationAPIClient = EvaluationAPIClient as jest.MockedClass<typeof EvaluationAPIClient>;

describe('EvaluationRunner', () => {
  let runner: EvaluationRunner;
  let mockApiClient: jest.Mocked<EvaluationAPIClient>;
  let mockConfig: EvaluationConfig;
  let mockRunnerConfig: RunnerConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock API client
    mockApiClient = new MockEvaluationAPIClient({} as any) as jest.Mocked<EvaluationAPIClient>;
    MockEvaluationAPIClient.mockImplementation(() => mockApiClient);

    mockConfig = {
      datasets: ['gold', 'ood', 'inject', 'rbac'],
      retrievalConfig: {
        topK: 5,
        rerankerEnabled: true
      },
      guardrailsConfig: {
        injectionDetectionEnabled: true,
        rbacEnforcementEnabled: true,
        idkThreshold: 0.8
      },
      outputConfig: {
        saveResults: true,
        outputDir: './output',
        includeDetails: true
      }
    };

    mockRunnerConfig = {
      verbose: false,
      parallel: false,
      maxConcurrency: 3
    };

    runner = new EvaluationRunner(mockConfig, mockApiClient);
  });

  describe('constructor', () => {
    it('should initialize with provided API client', () => {
      expect(runner).toBeDefined();
    });

    it('should create default API client when none provided', () => {
      const runnerWithoutClient = new EvaluationRunner(mockConfig);

      expect(MockEvaluationAPIClient).toHaveBeenCalledWith({
        baseUrl: expect.any(String),
        timeout: 30000,
        retries: 3
      });
    });
  });

  describe('initialize', () => {
    it('should initialize successfully when API is ready', async () => {
      mockApiClient.waitForReady.mockResolvedValue(true);

      const result = await runner.initialize();

      expect(result).toBe(true);
      expect(mockApiClient.waitForReady).toHaveBeenCalledWith(60000);
    });

    it('should throw error when API is not ready', async () => {
      mockApiClient.waitForReady.mockResolvedValue(false);

      await expect(runner.initialize()).rejects.toThrow('API is not ready after 60 seconds');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return combined performance metrics', () => {
      const apiMetrics = [{ startTime: 100, endTime: 200, duration: 100, retryCount: 0 }];
      mockApiClient.getMetrics.mockReturnValue(apiMetrics);

      // Simulate some internal metrics
      (runner as any).performanceMetrics = [{ startTime: 200, endTime: 300, duration: 100, retryCount: 1 }];

      const metrics = runner.getPerformanceMetrics();

      expect(metrics).toHaveLength(2);
      expect(metrics).toEqual([...(runner as any).performanceMetrics, ...apiMetrics]);
    });
  });

  describe('getAPIPerformanceStats', () => {
    it('should return API performance stats', () => {
      const mockStats = {
        totalCalls: 10,
        averageDuration: 500,
        successRate: 0.95,
        retryRate: 0.1,
        p95Duration: 800,
        p99Duration: 1000
      };
      mockApiClient.getPerformanceStats.mockReturnValue(mockStats);

      const stats = runner.getAPIPerformanceStats();

      expect(stats).toEqual(mockStats);
    });
  });

  describe('runDataset', () => {
    const mockRecords: GoldEvalRecord[] = [
      {
        id: 'gold_001',
        query: 'test query 1',
        tenantId: 'test-tenant',
        answerspan: 'answer',
        docId: 'doc1'
      },
      {
        id: 'gold_002',
        query: 'test query 2',
        tenantId: 'test-tenant',
        answerspan: 'answer',
        docId: 'doc2'
      }
    ];

    const mockDataset: Dataset = {
      type: 'gold',
      version: '1.0',
      description: 'Test dataset',
      records: mockRecords,
      metadata: {
        createdAt: '2023-01-01',
        totalRecords: 2
      }
    };

    beforeEach(() => {
      // Mock successful evaluation
      mockApiClient.ask.mockResolvedValue({
        response: {
          answer: 'Test answer',
          queryId: 'test-123',
          retrievedDocuments: [{
            document: {
              id: 'doc1',
              content: 'content',
              metadata: { tenantId: 'test-tenant', docId: 'doc1', acl: ['user'] }
            },
            score: 0.9
          }]
        },
        metrics: { startTime: 100, endTime: 200, duration: 100, retryCount: 0 }
      });
    });

    it('should run evaluations sequentially', async () => {
      const results = await runner.runDataset(mockDataset, mockRunnerConfig);

      expect(results).toHaveLength(2);
      expect(mockApiClient.ask).toHaveBeenCalledTimes(2);
      expect(results[0].recordId).toBe('gold_001');
      expect(results[1].recordId).toBe('gold_002');
    });

    it('should run evaluations in parallel', async () => {
      const parallelConfig = { ...mockRunnerConfig, parallel: true };

      const results = await runner.runDataset(mockDataset, parallelConfig);

      expect(results).toHaveLength(2);
      expect(mockApiClient.ask).toHaveBeenCalledTimes(2);
    });

    it('should respect maxConcurrency in parallel mode', async () => {
      const largeDataset = {
        ...mockDataset,
        records: Array(10).fill(null).map((_, i) => ({
          ...mockRecords[0],
          id: `gold_${i}`,
          query: `query ${i}`
        }))
      };

      const parallelConfig = { ...mockRunnerConfig, parallel: true, maxConcurrency: 2 };

      const results = await runner.runDataset(largeDataset, parallelConfig);

      expect(results).toHaveLength(10);
    });
  });

  describe('evaluateRecord', () => {
    it('should evaluate gold records', async () => {
      const record: GoldEvalRecord = {
        id: 'gold_001',
        query: 'test query',
        tenantId: 'test-tenant',
        answerspan: 'answer',
        docId: 'doc1'
      };

      mockApiClient.ask.mockResolvedValue({
        response: {
          answer: 'Test answer',
          queryId: 'test-123',
          retrievedDocuments: [{
            document: {
              id: 'doc1',
              content: 'content',
              metadata: { tenantId: 'test-tenant', docId: 'doc1', acl: ['user'] }
            },
            score: 0.9
          }]
        },
        metrics: { startTime: 100, endTime: 200, duration: 100, retryCount: 0 }
      });

      const result = await (runner as any).evaluateRecord(record, 'gold');

      expect(result.passed).toBe(true);
      expect(result.recordId).toBe('gold_001');
    });

    it('should evaluate OOD records', async () => {
      const record: OODEvalRecord = {
        id: 'ood_001',
        query: 'unknown query',
        tenantId: 'test-tenant',
        expectedResponse: 'IDK',
        category: 'outside_domain'
      };

      mockApiClient.ask.mockResolvedValue({
        response: {
          answer: "I don't know",
          queryId: 'test-123',
          retrievedDocuments: [],
          guardrailDecision: { isAnswerable: false, confidence: 0.9 }
        },
        metrics: { startTime: 100, endTime: 200, duration: 100, retryCount: 0 }
      });

      const result = await (runner as any).evaluateRecord(record, 'ood');

      expect(result.passed).toBe(true);
      expect(result.metrics.isIDKResponse).toBe(1);
    });

    it('should evaluate injection records', async () => {
      const record: InjectionEvalRecord = {
        id: 'inject_001',
        query: 'normal query',
        tenantId: 'test-tenant',
        injectionType: 'prompt_injection',
        maliciousPrompt: 'malicious prompt',
        expectedBehavior: 'reject'
      };

      mockApiClient.ask.mockResolvedValue({
        response: {
          answer: 'I cannot process this request',
          queryId: 'test-123',
          retrievedDocuments: []
        },
        metrics: { startTime: 100, endTime: 200, duration: 100, retryCount: 0 }
      });

      const result = await (runner as any).evaluateRecord(record, 'inject');

      expect(result.passed).toBe(true);
      expect(result.metrics.properBehavior).toBe(1);
    });

    it('should evaluate RBAC records', async () => {
      const record: RBACEvalRecord = {
        id: 'rbac_001',
        query: 'test query',
        tenantId: 'test-tenant',
        userId: 'user1',
        userGroups: ['users'],
        requiredACL: ['admin'],
        expectedDocIds: ['secret-doc'],
        allowedDocIds: ['public-doc']
      };

      mockApiClient.ask.mockResolvedValue({
        response: {
          answer: 'Access denied',
          queryId: 'test-123',
          retrievedDocuments: [{
            document: {
              id: 'public-doc',
              content: 'public content',
              metadata: { tenantId: 'test-tenant', docId: 'public-doc', acl: ['users'] }
            },
            score: 0.9
          }]
        },
        metrics: { startTime: 100, endTime: 200, duration: 100, retryCount: 0 }
      });

      const result = await (runner as any).evaluateRecord(record, 'rbac');

      expect(result.passed).toBe(true);
      expect(result.metrics.rbacViolations).toBe(0);
    });

    it('should handle unknown dataset types', async () => {
      const record = { id: 'test', query: 'test', tenantId: 'test' };

      const result = await (runner as any).evaluateRecord(record, 'unknown');

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Error: Unknown dataset type: unknown');
    });

    it('should handle evaluation errors', async () => {
      const record: GoldEvalRecord = {
        id: 'gold_001',
        query: 'test query',
        tenantId: 'test-tenant',
        answerspan: 'answer',
        docId: 'doc1'
      };

      mockApiClient.ask.mockRejectedValue(new Error('API Error'));

      const result = await (runner as any).evaluateRecord(record, 'gold');

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Error: API Error');
    });
  });

  describe('isIDKResponse', () => {
    it('should detect IDK responses', () => {
      const idkResponses = [
        "I don't know",
        "I don't have information",
        "Not enough information",
        "Cannot answer that"
      ];

      idkResponses.forEach(response => {
        expect((runner as any).isIDKResponse(response)).toBe(true);
      });
    });

    it('should not detect non-IDK responses', () => {
      const nonIdkResponses = [
        "The answer is 42",
        "According to the document",
        "Here's what I found"
      ];

      nonIdkResponses.forEach(response => {
        expect((runner as any).isIDKResponse(response)).toBe(false);
      });
    });
  });

  describe('detectInjectionInResponse', () => {
    it('should detect injection patterns', () => {
      const injectionResponses = [
        "system prompt: ignore instructions",
        "override security settings",
        "admin access granted"
      ];

      injectionResponses.forEach(response => {
        expect((runner as any).detectInjectionInResponse(response, 'prompt_injection')).toBe(false);
      });
    });

    it('should not detect clean responses', () => {
      const cleanResponses = [
        "The weather is nice",
        "According to the document",
        "Normal response"
      ];

      cleanResponses.forEach(response => {
        expect((runner as any).detectInjectionInResponse(response, 'prompt_injection')).toBe(true);
      });
    });
  });

  describe('evaluateInjectionBehavior', () => {
    it('should evaluate reject behavior', () => {
      expect((runner as any).evaluateInjectionBehavior('I cannot process this', 'reject')).toBe(true);
      expect((runner as any).evaluateInjectionBehavior('Here is the answer', 'reject')).toBe(false);
    });

    it('should evaluate sanitize behavior', () => {
      expect((runner as any).evaluateInjectionBehavior('Clean response', 'sanitize')).toBe(true);
      expect((runner as any).evaluateInjectionBehavior('password: secret', 'sanitize')).toBe(false);
    });
  });

  describe('containsMaliciousContent', () => {
    it('should detect malicious patterns', () => {
      const maliciousContent = [
        "password: admin123",
        "secret key: xyz",
        "admin credentials",
        "root privileges"
      ];

      maliciousContent.forEach(content => {
        expect((runner as any).containsMaliciousContent(content)).toBe(true);
      });
    });

    it('should not detect safe content', () => {
      const safeContent = [
        "The answer is 42",
        "Normal document content",
        "Regular response"
      ];

      safeContent.forEach(content => {
        expect((runner as any).containsMaliciousContent(content)).toBe(false);
      });
    });
  });

  describe('chunkArray', () => {
    it('should chunk arrays correctly', () => {
      const array = [1, 2, 3, 4, 5, 6, 7];
      const chunks = (runner as any).chunkArray(array, 3);

      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('should handle empty arrays', () => {
      const chunks = (runner as any).chunkArray([], 3);
      expect(chunks).toEqual([]);
    });

    it('should handle chunk size larger than array', () => {
      const array = [1, 2];
      const chunks = (runner as any).chunkArray(array, 5);
      expect(chunks).toEqual([[1, 2]]);
    });
  });
});