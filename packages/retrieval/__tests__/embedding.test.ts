import { BgeSmallEnV15EmbeddingService } from '../src/embedding.js';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BgeSmallEnV15EmbeddingService', () => {
  let service: BgeSmallEnV15EmbeddingService;
  const mockText = 'test text';
  const EMBEDDING_DIMENSIONS = 384;

  beforeEach(() => {
    service = new BgeSmallEnV15EmbeddingService();
    // Reset mocks before each test
    mockedAxios.post.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a 384-length array for embedding', async () => {
    const mockEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }).map(() => Math.random());
    mockedAxios.post.mockResolvedValueOnce({ data: [mockEmbedding] });

    const result = await service.embed(mockText);

    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    // After L2 normalization, the magnitude of the vector should be 1
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1);
  });

  it('should apply L2 normalization to the embedding vector', async () => {
    const rawEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }).map((_, i) => i + 1); // 1, 2, 3...
    const norm = Math.sqrt(rawEmbedding.reduce((sum, val) => sum + val * val, 0));
    const expectedNormalized = rawEmbedding.map(v => v / norm);

    mockedAxios.post.mockResolvedValueOnce({ data: [rawEmbedding] });

    const result = await service.embed(mockText);

    expect(result.length).toBe(EMBEDDING_DIMENSIONS);
    expectedNormalized.forEach((val, i) => {
      expect(result[i]).toBeCloseTo(val);
    });
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1);
  });

  it('should retry on embedding service failure with exponential backoff', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('Network error')) // First failure
      .mockRejectedValueOnce(new Error('Service unavailable')) // Second failure
      .mockResolvedValueOnce({
        data: [Array.from({ length: EMBEDDING_DIMENSIONS }).map(() => Math.random())],
      }); // Success on third attempt

    const result = await service.embed(mockText);

    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1);
  });

  it('should log structured error and throw after max retries', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Service completely down')); // Always fail

    await expect(service.embed(mockText)).rejects.toThrow('Failed to get embeddings after 3 attempts: Service completely down');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3); // 1 initial + 2 retries = 3 total attempts
    expect(console.error).toHaveBeenCalledWith(
        'StructuredLog:EmbeddingServiceFailure',
        expect.objectContaining({
            texts: [mockText],
            error: 'Service completely down',
            attempt: 3,
        })
    );
  });

  it('should throw an error if embedding service returns unexpected dimensions', async () => {
    const mockEmbedding = Array.from({ length: 100 }).map(() => Math.random()); // Incorrect dimension
    mockedAxios.post.mockResolvedValueOnce({ data: [mockEmbedding] });

    await expect(service.embed(mockText)).rejects.toThrow('Expected 384 dimensions, but got 100');
  });

  it('should handle embedDocument by calling embed with document content', async () => {
    const mockDocument = {
      id: "doc1",
      content: "document content",
      metadata: { tenantId: "test", docId: "doc1", acl: ["public"], lang: "en", url: "http://example.com" }
    };
    const mockEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }).map(() => Math.random());
    mockedAxios.post.mockResolvedValueOnce({ data: [mockEmbedding] });

    const result = await service.embedDocument(mockDocument);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      { inputs: [mockDocument.content] },
      expect.any(Object)
    );
    expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1);
  });
});