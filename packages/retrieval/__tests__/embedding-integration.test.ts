import { BgeSmallEnV15EmbeddingService } from '../src/embedding.js';

describe('BGE Small EN v1.5 Embedding Service Integration', () => {
  let embeddingService: BgeSmallEnV15EmbeddingService;

  beforeAll(() => {
    embeddingService = new BgeSmallEnV15EmbeddingService();
  });

  test('should generate 384-dimensional embeddings with L2 normalization', async () => {
    const testText = 'Hello world test embedding for BGE model';

    const embedding = await embeddingService.embed(testText);

    // Validate dimensions
    expect(embedding).toHaveLength(384);

    // Validate L2 normalization (magnitude should be approximately 1)
    const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);

    // Validate all values are numbers
    embedding.forEach((val: number) => {
      expect(typeof val).toBe('number');
      expect(isFinite(val)).toBe(true);
    });
  }, 30000); // Longer timeout for model loading

  test('should handle document embedding', async () => {
    const testDocument = {
      id: 'test-doc',
      content: 'This is a test document for embedding validation',
      metadata: {
        tenantId: 'zenithfall',
        docId: 'test-doc',
        acl: ['user:test']
      }
    };

    const embedding = await embeddingService.embedDocument(testDocument);

    expect(embedding).toHaveLength(384);

    const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  }, 30000);

  test('should produce consistent embeddings for same text', async () => {
    const testText = 'Consistent embedding test';

    const embedding1 = await embeddingService.embed(testText);
    const embedding2 = await embeddingService.embed(testText);

    expect(embedding1).toHaveLength(384);
    expect(embedding2).toHaveLength(384);

    // Embeddings should be identical for the same input
    for (let i = 0; i < embedding1.length; i++) {
      expect(embedding1[i]).toBeCloseTo(embedding2[i], 10);
    }
  }, 30000);

  test('should produce different embeddings for different texts', async () => {
    const text1 = 'First test sentence';
    const text2 = 'Completely different sentence';

    const embedding1 = await embeddingService.embed(text1);
    const embedding2 = await embeddingService.embed(text2);

    expect(embedding1).toHaveLength(384);
    expect(embedding2).toHaveLength(384);

    // Calculate cosine similarity - should be less than 1 (different texts)
    const dotProduct = embedding1.reduce((sum: number, val: number, i: number) => sum + val * embedding2[i], 0);
    expect(dotProduct).toBeLessThan(0.99); // Should not be identical
  }, 30000);
});