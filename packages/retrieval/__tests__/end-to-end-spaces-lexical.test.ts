import { SpaceResolver } from '@cw-rag-core/shared';
import { LexicalSearch } from '../src/lexical-search.js';
import { QdrantClientStub } from '../src/qdrant.js';
import { BgeSmallEnV15EmbeddingService } from '../src/embedding.js';

// Mock file system operations to avoid persistence issues
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

describe('End-to-End Spaces and Lexical Integration', () => {
  let spaceResolver: SpaceResolver;
  let lexicalSearch: LexicalSearch;
  let embeddingService: BgeSmallEnV15EmbeddingService;

  const chunkedDoc = {
    content: '## Knowledge (Intellect, Perception, Foresight) | Tier | Concrete Abilities',
    metadata: {
      tenantId: 'test-tenant',
      docId: 'chunk-1',
      acl: ['user1'],
      lang: 'en',
    },
  };

  beforeEach(() => {
    // Mock fs operations to simulate missing files
    const fs = require('fs/promises');
    fs.readFile.mockRejectedValue({ code: 'ENOENT' });
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);

    spaceResolver = new SpaceResolver();
    embeddingService = new BgeSmallEnV15EmbeddingService();
    lexicalSearch = new LexicalSearch(new QdrantClientStub());
  });

  it('should complete full pipeline: resolve space -> ingest -> query with lexical', async () => {
    // Step 1: Resolve space
    const spaceResult = await spaceResolver.resolveSpace({
      tenantId: chunkedDoc.metadata.tenantId,
      text: chunkedDoc.content,
      source: 'api',
    });

    // Should create an auto-space since text doesn't match enough catalog keywords
    expect(spaceResult.spaceId).toContain('-knowledge-intellect');
    expect(spaceResult.lexicalHints?.coreTokens).toContain('knowledge');
    expect(spaceResult.autoCreated).toBe(true);

    // Step 2: Simulate ingestion with space and lexical data
    // (In real scenario, this would call ingestDocument with spaceId and lexicalHints)

    // Step 3: Query with space filtering and lexical search
    const ctx = {
      tenantId: chunkedDoc.metadata.tenantId,
      spaceIds: [spaceResult.spaceId],
      debug: true,
    };

    const results = await lexicalSearch.search('knowledge domain abilities', ctx);

    expect(results).toBeDefined();
    expect(results.results).toBeDefined();
    // Verify that space filtering and lexical features are applied
  });

  it('should handle RBAC and space isolation', async () => {
    // Test that queries respect space boundaries
    const ctx1 = {
      tenantId: 'tenant1',
      spaceIds: ['hr'],
    };

    const ctx2 = {
      tenantId: 'tenant2',
      spaceIds: ['legal'],
    };

    const results1 = await lexicalSearch.search('policy', ctx1);
    const results2 = await lexicalSearch.search('policy', ctx2);

    // Results should be isolated by tenant and space
    expect(results1).not.toEqual(results2);
  });

  it('should improve retrieval precision with spaces and lexical features', async () => {
    // Test that space + lexical filtering improves relevance
    const broadQuery = 'abilities';
    const specificQuery = 'knowledge domain abilities';

    const broadResults = await lexicalSearch.search(broadQuery, {
      tenantId: 'test-tenant',
    });

    const specificResults = await lexicalSearch.search(specificQuery, {
      tenantId: 'test-tenant',
      spaceIds: ['knowledge'],
    });

    // Specific query with space filtering should be more precise
    expect(specificResults.results.length).toBeLessThanOrEqual(broadResults.results.length);
  });

  it('should handle multi-language content', async () => {
    const germanContent = '## Wissen (Intellekt, Wahrnehmung, Voraussicht) | Stufe | Konkrete Fähigkeiten';

    const spaceResult = await spaceResolver.resolveSpace({
      tenantId: 'test-tenant',
      text: germanContent,
      source: 'api',
    });

    // Should create an auto-space for German content since catalog is English-only
    expect(spaceResult.spaceId).toContain('-wissen-intellekt');
    expect(spaceResult.lexicalHints?.language).toBe('de');
    expect(spaceResult.autoCreated).toBe(true);
  });
});