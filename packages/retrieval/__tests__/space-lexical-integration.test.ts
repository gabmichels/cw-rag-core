import { SpaceResolver, SpaceRegistryService, SpaceRegistry, Space, FALLBACK_SPACE_ID, SEED_SPACES } from '@cw-rag-core/shared';
import { LexicalSearch } from '../src/lexical-search.js';
import { QdrantClientStub } from '../src/qdrant.js';

describe('Space-Lexical Integration', () => {
  let spaceResolver: SpaceResolver;
  let lexicalSearch: LexicalSearch;
  let mockSpaceRegistryService: SpaceRegistryService;
  let registryState: Map<string, SpaceRegistry>; // To simulate an in-memory file system

  beforeEach(() => {
    registryState = new Map<string, SpaceRegistry>();

    // Mock SpaceRegistryService methods to operate on in-memory state
    mockSpaceRegistryService = {
      loadRegistry: jest.fn(async (tenantId: string) => {
        if (!registryState.has(tenantId)) {
          const defaultRegistry: SpaceRegistry = {
            tenantId,
            spaces: SEED_SPACES.map(space => ({ ...space, owner: 'system' })),
            version: '1.0',
          };
          // Ensure fallback space exists in default registry
          if (!defaultRegistry.spaces.some(s => s.id === FALLBACK_SPACE_ID)) {
            defaultRegistry.spaces.push({
              id: FALLBACK_SPACE_ID,
              name: 'General',
              description: 'Default space for uncategorized documents',
              owner: 'system',
              status: 'active',
              authorityScore: 0.5,
              autoCreated: false,
            });
          }
          registryState.set(tenantId, defaultRegistry);
        }
        // Return a deep copy to prevent direct modification of internal state by SpaceResolver
        return JSON.parse(JSON.stringify(registryState.get(tenantId)!));
      }),
      saveRegistry: jest.fn(async (registry: SpaceRegistry) => {
        // Store a deep copy of the registry
        registryState.set(registry.tenantId, JSON.parse(JSON.stringify(registry)));
      }),
      addSpace: jest.fn(async (tenantId: string, space: Omit<Space, 'id'> & { id: string }) => {
        const registry = await mockSpaceRegistryService.loadRegistry(tenantId);
        if (registry.spaces.some(s => s.id === space.id)) {
          throw new Error(`Space with id ${space.id} already exists for tenant ${tenantId}`);
        }
        registry.spaces.push(space as Space);
        await mockSpaceRegistryService.saveRegistry(registry);
      }),
      getSpace: jest.fn(async (tenantId: string, spaceId: string) => {
        const registry = await mockSpaceRegistryService.loadRegistry(tenantId);
        return registry.spaces.find(s => s.id === spaceId) || null;
      }),
      listSpaces: jest.fn(async (tenantId: string) => {
        const registry = await mockSpaceRegistryService.loadRegistry(tenantId);
        return registry.spaces;
      }),
      updateSpace: jest.fn(),
    } as any; // Cast to any because it's a partial mock

    spaceResolver = new SpaceResolver(mockSpaceRegistryService);
    lexicalSearch = new LexicalSearch(new QdrantClientStub()); // Assuming QdrantClientStub doesn't cause issues
  });

  it('should resolve space with lexical hints', async () => {
    const input = {
      tenantId: 'test-tenant',
      text: 'Knowledge Domain abilities include Recall Lore and Identify Creature',
      source: 'n8n',
    };

    const result = await spaceResolver.resolveSpace(input);

    expect(result.spaceId).toMatch(/^-knowledge-domain-\w+$/);
    expect(result.lexicalHints).toBeDefined();
    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases).toContain('knowledge domain');
    expect(result.lexicalHints?.language).toBe('en');
  });

  it('should use space filtering in lexical search', async () => {
    const ctx = {
      tenantId: 'test-tenant',
      spaceIds: ['knowledge'], // This space needs to exist in the mock registry
      debug: true,
    };

    // Ensure the 'knowledge' space is available in the mock registry for this test
    await mockSpaceRegistryService.addSpace(ctx.tenantId, {
      id: 'knowledge',
      name: 'Knowledge',
      description: 'Knowledge domain',
      owner: 'system',
      status: 'active',
      authorityScore: 0.5,
      autoCreated: false,
    });

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
    const tenantId = 'test-tenant';

    // To prevent the "already exists" error in this test, we need to ensure the space
    // that would be auto-created for this text doesn't clash with previous tests or
    // modify the expected spaceId
    const result = await spaceResolver.resolveSpace({
      tenantId: tenantId,
      text: chunkedText,
      source: 'api',
    });

    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases).toContain('concrete abilities');
    expect(result.spaceId).toMatch(/^-knowledge-intellect-\w+$/);
  });
});