import { SpaceResolver } from '../services/space-resolver.js';

describe('Space-Lexical Integration', () => {
  let spaceResolver: SpaceResolver;

  beforeEach(() => {
    spaceResolver = new SpaceResolver();
  });

  it('should resolve space with lexical hints', async () => {
    const input = {
      tenantId: 'test-tenant-' + Date.now(),
      text: 'Knowledge Domain abilities include Recall Lore and Identify Creature',
      source: 'n8n',
    };

    const result = await spaceResolver.resolveSpace(input);

    // Should either match existing space or auto-create
    expect(result.spaceId).toBeDefined();
    expect(result.lexicalHints).toBeDefined();
    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases.length).toBeGreaterThan(0);
    expect(result.lexicalHints?.language).toBe('en');
  });

  it('should extract lexical hints from chunked document sample', async () => {
    const chunkedText = '## Knowledge (Intellect, Perception, Foresight) | Tier | Concrete Abilities';

    const result = await spaceResolver.resolveSpace({
      tenantId: 'test-tenant-' + Date.now(),
      text: chunkedText,
      source: 'api',
    });

    expect(result.lexicalHints?.coreTokens).toContain('knowledge');
    expect(result.lexicalHints?.phrases.length).toBeGreaterThan(0);
    expect(result.spaceId).toBeDefined();
  });

  it('should handle German text detection', async () => {
    const germanText = '## Wissen (Intellekt, Wahrnehmung, Voraussicht) | Stufe | Konkrete Fähigkeiten. Der Text ist auf Deutsch.';

    const result = await spaceResolver.resolveSpace({
      tenantId: 'test-tenant-' + Date.now(),
      text: germanText,
      source: 'api',
    });

    expect(result.lexicalHints?.language).toBe('de');
    expect(result.spaceId).toBeDefined();
  });
});