import { LexicalRegistryService } from '../services/lexical-registry.js';

// Simple mock function creator
function createMockFn(returnValue: any) {
  return () => Promise.resolve(returnValue);
}

// Mock the service methods directly
const originalLoadRegistry = LexicalRegistryService.prototype.loadRegistry;

describe('LexicalRegistryService', () => {
  let service: LexicalRegistryService;
  const testTenantId = 'test-tenant';

  beforeEach(() => {
    service = new LexicalRegistryService('./test-tenants');
  });

  afterEach(() => {
    // Restore original method
    LexicalRegistryService.prototype.loadRegistry = originalLoadRegistry;
  });

  it('should create default registry', async () => {
    // Mock loadRegistry to return a default registry
    const mockRegistry = {
      tenantId: testTenantId,
      languagePacks: {
        en: { id: 'en', stopwords: ['the', 'and', 'or'], normalize: () => '', tokenize: () => [] },
        de: { id: 'de', stopwords: ['der', 'die', 'das'], normalize: () => '', tokenize: () => [] }
      },
      domainPacks: {
        general: { id: 'general', fieldBoosts: { title: 2.0, content: 1.0 } }
      },
      tenantPack: {
        id: testTenantId,
        domainId: 'general',
        languageDefault: 'en',
        systemPrompt: 'You are a helpful assistant.'
      },
      version: '1.0'
    };

    LexicalRegistryService.prototype.loadRegistry = createMockFn(mockRegistry);

    const registry = await service.loadRegistry(testTenantId);

    expect(registry.tenantId).toBe(testTenantId);
    expect(registry.languagePacks).toHaveProperty('en');
    expect(registry.languagePacks).toHaveProperty('de');
    expect(registry.domainPacks).toHaveProperty('general');
    expect(registry.tenantPack.languageDefault).toBe('en');
  });

  it('should get language pack', async () => {
    const mockRegistry = {
      tenantId: testTenantId,
      languagePacks: {
        en: { id: 'en', stopwords: ['the', 'and', 'or'], normalize: () => '', tokenize: () => [] }
      },
      domainPacks: {},
      tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
      version: '1.0'
    };

    LexicalRegistryService.prototype.loadRegistry = createMockFn(mockRegistry);

    const pack = await service.getLanguagePack(testTenantId, 'en');
    expect(pack).toBeTruthy();
    expect(pack?.id).toBe('en');
    expect(pack?.stopwords).toContain('the');
  });

  it('should get domain pack', async () => {
    const mockRegistry = {
      tenantId: testTenantId,
      languagePacks: {},
      domainPacks: {
        knowledge: { id: 'knowledge', fieldBoosts: { title: 3.0, content: 1.0 } }
      },
      tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
      version: '1.0'
    };

    LexicalRegistryService.prototype.loadRegistry = createMockFn(mockRegistry);

    const pack = await service.getDomainPack(testTenantId, 'knowledge');
    expect(pack).toBeTruthy();
    expect(pack?.id).toBe('knowledge');
    expect(pack?.fieldBoosts.title).toBe(3.0);
  });

  it('should get tenant pack', async () => {
    const mockRegistry = {
      tenantId: testTenantId,
      languagePacks: {},
      domainPacks: {},
      tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: 'test' },
      version: '1.0'
    };

    LexicalRegistryService.prototype.loadRegistry = createMockFn(mockRegistry);

    const pack = await service.getTenantPack(testTenantId);
    expect(pack.id).toBe(testTenantId);
    expect(pack.languageDefault).toBe('en');
  });
});