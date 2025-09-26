import { SpaceResolver } from '@cw-rag-core/shared';
import { LexicalSearch } from '../src/lexical-search.js';
import { QdrantClientStub } from '../src/qdrant.js';

describe('Space-Lexical Integration', () => {
  let spaceResolver: SpaceResolver;
  let lexicalSearch: LexicalSearch;

  beforeEach(() => {
    spaceResolver = new SpaceResolver();
    lexicalSearch = new LexicalSearch(new QdrantClientStub());
  });

  it('should resolve space with lexical hints', async () => {
    const input = {
      tenantId: 'test-tenant',
      text: 'Knowledge Domain abilities include Recall Lore and Identify Creature',
      source: 'n8n',
    };

    const result = await spaceResolver.resolveSpace(input);

    expect(result.spaceId).toBe('knowledge');
    expect(result.lexicalHints).toBeDefined();
    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases).toContain('knowledge domain');
    expect(result.lexicalHints?.language).toBe('en');
  });

  it('should use space filtering in lexical search', async () => {
    const ctx = {
      tenantId: 'test-tenant',
      spaceIds: ['knowledge'],
      debug: true,
    };

    // Mock the executeQuery method to verify space filtering
    const mockExecuteQuery = jest.fn().mockResolvedValue([]);
    lexicalSearch['executeQuery'] = mockExecuteQuery;

    await lexicalSearch.search('test query', ctx);

    expect(mockExecuteQuery).toHaveBeenCalledWith(
      expect.any(Object),
      'test-tenant',
      ['knowledge']
    );
  });

  it('should extract lexical hints from chunked document sample', async () => {
    const chunkedText = '## Knowledge (Intellect, Perception, Foresight) | Tier | Concrete Abilities';

    const result = await spaceResolver.resolveSpace({
      tenantId: 'test-tenant',
      text: chunkedText,
      source: 'api',
    });

    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases).toContain('concrete abilities');
    expect(result.spaceId).toBe('knowledge');
  });
});