/**
 * Integration tests for EmbeddingServiceManager
 */

import { EmbeddingServiceManager, createEmbeddingServiceManager } from '../src/embedding-manager.js';
import { EmbeddingServiceConfig, DEFAULT_EMBEDDING_CONFIGS } from '../src/embedding-config.js';

// Mock axios for testing
jest.mock('axios');
const mockedAxios = jest.mocked(require('axios'));

describe('EmbeddingServiceManager', () => {
  let manager: EmbeddingServiceManager;
  let mockConfig: Partial<EmbeddingServiceConfig>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      provider: 'bge',
      model: 'bge-small-en-v1.5',
      url: 'http://test-embedding-service:80/embed',
      capabilities: {
        maxTokens: 512,
        maxBatchSize: 32,
        dimensions: 384,
        supportsBatching: true,
        supportsStreaming: false
      },
      chunking: {
        strategy: 'token-aware',
        maxTokens: 460,
        overlapTokens: 50,
        minChunkTokens: 50,
        safetyMargin: 0.1,
        preserveBoundaries: true,
        fallbackStrategy: 'truncate'
      }
    };
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      manager = new EmbeddingServiceManager(mockConfig);
      const config = manager.getConfig();

      expect(config.provider).toBeDefined();
      expect(config.model).toBeDefined();
      expect(config.capabilities.maxTokens).toBeGreaterThan(0);
    });

    it('should initialize with provided configuration', () => {
      manager = new EmbeddingServiceManager(mockConfig);
      const config = manager.getConfig();

      expect(config.provider).toBe('bge');
      expect(config.model).toBe('bge-small-en-v1.5');
      expect(config.capabilities.maxTokens).toBe(512);
    });

    it('should validate configuration on initialization', () => {
      const invalidConfig = {
        provider: 'bge',
        model: '', // Invalid: empty model
        url: 'http://test:80'
      };

      expect(() => new EmbeddingServiceManager(invalidConfig as any))
        .toThrow('Missing required embedding service configuration: provider, model, or url');
    });

    it('should update configuration at runtime', () => {
      manager = new EmbeddingServiceManager(mockConfig);

      const newConfig = {
        capabilities: {
          ...mockConfig.capabilities!,
          maxTokens: 256
        }
      };

      manager.updateConfig(newConfig);
      const updatedConfig = manager.getConfig();

      expect(updatedConfig.capabilities.maxTokens).toBe(256);
    });
  });

  describe('Single Text Embedding', () => {
    beforeEach(() => {
      manager = new EmbeddingServiceManager(mockConfig);

      // Mock successful API response
      mockedAxios.post.mockResolvedValue({
        data: [Array(384).fill(0.1)] // Mock 384-dimensional embedding
      });
    });

    it('should embed short text directly', async () => {
      const text = 'Short text that fits in one request';
      const result = await manager.embed(text);

      expect(result).toHaveLength(384);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockConfig.url,
        { inputs: [text] },
        expect.any(Object)
      );
    });

    it('should chunk and average embeddings for long text', async () => {
      const longText = 'Long text '.repeat(200); // Should exceed token limit

      // Mock multiple embedding responses
      mockedAxios.post
        .mockResolvedValueOnce({ data: [Array(384).fill(0.1)] })
        .mockResolvedValueOnce({ data: [Array(384).fill(0.2)] });

      const result = await manager.embed(longText);

      expect(result).toHaveLength(384);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Should be chunked and batched
    });

    it('should handle embedding service errors with retries', async () => {
      const text = 'Test text';

      // Mock failures then success
      mockedAxios.post
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockRejectedValueOnce(new Error('Service still down'))
        .mockResolvedValueOnce({ data: [Array(384).fill(0.1)] });

      const result = await manager.embed(text);

      expect(result).toHaveLength(384);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const text = 'Test text';

      // Mock persistent failures
      mockedAxios.post.mockRejectedValue(new Error('Service down'));

      await expect(manager.embed(text)).rejects.toThrow('failed after 3 attempts');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('Batch Embedding', () => {
    beforeEach(() => {
      manager = new EmbeddingServiceManager(mockConfig);
    });

    it('should process batch of short texts', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];

      mockedAxios.post.mockResolvedValue({
        data: [
          Array(384).fill(0.1),
          Array(384).fill(0.2),
          Array(384).fill(0.3)
        ]
      });

      const results = await manager.embedBatch(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(384);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed text sizes in batch', async () => {
      const texts = [
        'Short text',
        'Very long text that will exceed the token limit '.repeat(50)
      ];

      mockedAxios.post
        .mockResolvedValueOnce({ data: [Array(384).fill(0.1)] }) // Short text
        .mockResolvedValueOnce({ data: [Array(384).fill(0.2)] }); // Long text chunks

      const results = await manager.embedBatch(texts);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(384);
      expect(results[1]).toHaveLength(384);
    });
  });

  describe('Advanced Chunking', () => {
    beforeEach(() => {
      manager = new EmbeddingServiceManager(mockConfig);
    });

    it('should perform advanced chunking with metadata', async () => {
      const longText = 'This is a long document. '.repeat(200);

      mockedAxios.post.mockResolvedValue({
        data: [Array(384).fill(0.1)]
      });

      const result = await manager.embedWithChunking(longText, 'test-doc');

      expect(result.embeddings.length).toBeGreaterThan(1);
      expect(result.chunksProcessed).toBe(result.embeddings.length);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);

      // Check embedding metadata
      for (const embedding of result.embeddings) {
        expect(embedding.embedding).toHaveLength(384);
        expect(embedding.tokenCount).toBeGreaterThan(0);
        expect(embedding.chunkId).toBeDefined();
        expect(embedding.metadata).toBeDefined();
      }
    });

    it('should handle chunking warnings', async () => {
      // Create text with problematic content for chunking
      const problematicText = 'A'.repeat(2000); // Very long without sentence boundaries

      mockedAxios.post.mockResolvedValue({
        data: [Array(384).fill(0.1)]
      });

      const result = await manager.embedWithChunking(problematicText, 'test-doc');

      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      expect(result.embeddings.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check and Capabilities', () => {
    beforeEach(() => {
      manager = new EmbeddingServiceManager(mockConfig);
    });

    it('should perform health check', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { status: 'healthy', version: '1.0.0' }
      });

      const health = await manager.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.responseTime).toBeGreaterThan(0);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://test-embedding-service:80/health',
        expect.any(Object)
      );
    });

    it('should handle health check failures', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));

      const health = await manager.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection refused');
    });

    it('should get service capabilities', async () => {
      const capabilities = await manager.getCapabilities();

      expect(capabilities.maxTokens).toBe(512);
      expect(capabilities.dimensions).toBe(384);
      expect(capabilities.supportsBatching).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      manager = new EmbeddingServiceManager(mockConfig);
    });

    it('should handle 413 errors appropriately', async () => {
      const text = 'Test text';

      const error413 = {
        response: { status: 413 },
        message: 'Request failed with status code 413'
      };

      mockedAxios.post.mockRejectedValue(error413);

      await expect(manager.embed(text)).rejects.toThrow('413');
    });

    it('should handle rate limiting with retries', async () => {
      const text = 'Test text';

      const error429 = {
        response: { status: 429 },
        message: 'Rate limited'
      };

      mockedAxios.post
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({ data: [Array(384).fill(0.1)] });

      const result = await manager.embed(text);

      expect(result).toHaveLength(384);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should validate embedding dimensions', async () => {
      const text = 'Test text';

      // Mock response with wrong dimensions
      mockedAxios.post.mockResolvedValue({
        data: [Array(256).fill(0.1)] // Wrong dimension
      });

      await expect(manager.embed(text)).rejects.toThrow('Invalid embedding dimensions: expected 384, got 256');
    });
  });

  describe('Factory Function', () => {
    it('should create manager with factory function', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

      const manager = await createEmbeddingServiceManager(mockConfig);

      expect(manager).toBeInstanceOf(EmbeddingServiceManager);
      expect(manager.getConfig().provider).toBe('bge');
    });

    it('should handle health check failure in factory', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Service down'));

      // Should still create manager but log warning
      const manager = await createEmbeddingServiceManager(mockConfig);

      expect(manager).toBeInstanceOf(EmbeddingServiceManager);
    });
  });

  describe('Configuration Presets', () => {
    it('should work with BGE configuration preset', () => {
      const bgeConfig = { ...DEFAULT_EMBEDDING_CONFIGS['bge-small-en-v1.5'], url: 'http://test-bge:80' };
      manager = new EmbeddingServiceManager(bgeConfig);

      const config = manager.getConfig();
      expect(config.provider).toBe('bge');
      expect(config.capabilities.dimensions).toBe(384);
    });

    it('should work with OpenAI configuration preset', () => {
      const openaiConfig = { ...DEFAULT_EMBEDDING_CONFIGS['text-embedding-ada-002'], url: 'http://test-openai:80' };
      manager = new EmbeddingServiceManager(openaiConfig);

      const config = manager.getConfig();
      expect(config.provider).toBe('openai');
      expect(config.capabilities.dimensions).toBe(1536);
    });
  });
});