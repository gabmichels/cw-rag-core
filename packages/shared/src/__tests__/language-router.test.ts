import { LanguageRouter } from '../services/language-router.js';
import { LexicalRegistryService } from '../services/lexical-registry.js';
import { LanguagePack, TenantPack as TenantLanguagePack } from '../schemas/lexical.js'; // Import LanguagePack and TenantPack from schemas
import { detectLanguage } from '../utils/normalization.js'; // Import detectLanguage directly

// Mock dependencies
jest.mock('../services/lexical-registry.js');
jest.mock('../utils/normalization.js', () => ({
  detectLanguage: jest.fn(),
}));

const MockLexicalRegistryService = LexicalRegistryService as jest.MockedClass<typeof LexicalRegistryService>;
const mockDetectLanguage = detectLanguage as jest.Mock; // Cast detectLanguage to Jest mock type

describe('LanguageRouter', () => {
  let router: LanguageRouter;
  let mockRegistryService: jest.Mocked<LexicalRegistryService>;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Create mock registry service instance for each test
    mockRegistryService = {
      getLanguagePack: jest.fn<Promise<LanguagePack | null>, [string, string]>(),
      getTenantPack: jest.fn<Promise<TenantLanguagePack | null>, [string]>(),
    } as any;

    // Set up the mock implementation for the constructor
    MockLexicalRegistryService.mockImplementation(() => mockRegistryService);

    // Default router instance uses the mocked registry
    router = new LanguageRouter(mockRegistryService);
  });

  describe('constructor', () => {
    it('should use provided registry service', () => {
      jest.clearAllMocks(); // Clear mocks before this specific test
      const customRegistry = { getLanguagePack: jest.fn(), getTenantPack: jest.fn() } as any;
      const routerWithCustom = new LanguageRouter(customRegistry);
      expect(routerWithCustom).toBeInstanceOf(LanguageRouter);
      expect(MockLexicalRegistryService).not.toHaveBeenCalled(); // Should not call the mocked constructor
    });

    it('should create default registry service when none provided', () => {
      jest.clearAllMocks(); // Clear mocks before this specific test
      const routerDefault = new LanguageRouter();
      expect(routerDefault).toBeInstanceOf(LanguageRouter);
      expect(MockLexicalRegistryService).toHaveBeenCalledTimes(1);
      // Ensure the instance created by the default constructor is also a mocked one
      // The default constructor will use the mocked `LexicalRegistryService`, which returns `mockRegistryService`
      // We can then verify directly on `mockRegistryService` after calling a method on `routerDefault`
      // The default constructor will use the mocked `LexicalRegistryService`, which returns `mockRegistryService`
      // We can then verify directly on `mockRegistryService` after calling a method on `routerDefault`
      // Since `getLanguagePack` is async, we can just call it without awaiting in this context
      routerDefault.getLanguagePack('tenant', 'en'); // Use a public method that delegates to the registry service
      expect(mockRegistryService.getLanguagePack).toHaveBeenCalledWith('tenant', 'en'); // Verify interaction with the mocked instance
    });
  });

  describe('detect', () => {
    const testTenantId = 'test-tenant';
    const testQuery = 'Hello world';
    const testContext = { tenantId: testTenantId, langHint: 'en' };

    it('should return hinted language when hint is provided and pack exists', async () => {
      const mockPack = { id: 'en', stopwords: ['the'], synonyms: {}, phraseSlop: 2, fieldMap: {}, normalize: jest.fn(), tokenize: jest.fn() };
      mockRegistryService.getLanguagePack.mockResolvedValue(mockPack as any);

      const result = await router.detect(testQuery, testContext);

      expect(result).toBe('en');
      expect(mockRegistryService.getLanguagePack).toHaveBeenCalledWith(testTenantId, 'en');
      expect(mockDetectLanguage).not.toHaveBeenCalled();
    });

    it('should detect language when hint is provided but pack does not exist', async () => {
      mockRegistryService.getLanguagePack.mockResolvedValue(null);
      mockDetectLanguage.mockReturnValue('de');

      const mockTenantPack = { id: 'test', domainId: 'general', languageDefault: 'en', systemPrompt: 'test' };
      mockRegistryService.getTenantPack.mockResolvedValue(mockTenantPack as any);

      const result = await router.detect(testQuery, testContext);

      expect(result).toBe('de');
      expect(mockDetectLanguage).toHaveBeenCalledWith(testQuery);
    });

    it('should detect language when no hint provided', async () => {
      const contextWithoutHint = { tenantId: testTenantId };
      mockDetectLanguage.mockReturnValue('fr');

      const mockTenantPack = { id: 'test', domainId: 'general', languageDefault: 'en', systemPrompt: 'test' };
      mockRegistryService.getTenantPack.mockResolvedValue(mockTenantPack as any);

      const result = await router.detect(testQuery, contextWithoutHint);

      expect(result).toBe('fr');
      expect(mockDetectLanguage).toHaveBeenCalledWith(testQuery);
      expect(mockRegistryService.getTenantPack).toHaveBeenCalledWith(testTenantId);
    });

    it('should fallback to tenant default when detection fails', async () => {
      const contextWithoutHint = { tenantId: testTenantId };
      mockDetectLanguage.mockReturnValue(null);

      const mockTenantPack = { id: 'test', domainId: 'general', languageDefault: 'de', systemPrompt: 'test' };
      mockRegistryService.getTenantPack.mockResolvedValue(mockTenantPack as any);

      const result = await router.detect(testQuery, contextWithoutHint);

      expect(result).toBe('de');
      expect(mockRegistryService.getTenantPack).toHaveBeenCalledWith(testTenantId);
    });

    it('should handle empty query', async () => {
      const contextWithoutHint = { tenantId: testTenantId };
      mockDetectLanguage.mockReturnValue(null);

      const mockTenantPack = { id: 'test', domainId: 'general', languageDefault: 'en', systemPrompt: 'test' };
      mockRegistryService.getTenantPack.mockResolvedValue(mockTenantPack as any);

      const result = await router.detect('', contextWithoutHint);

      expect(result).toBe('en');
    });

    it('should handle undefined context properties', async () => {
      const contextWithUndefined = { tenantId: testTenantId, langHint: undefined };
      mockDetectLanguage.mockReturnValue('es');

      const mockTenantPack = { id: 'test', domainId: 'general', languageDefault: 'en', systemPrompt: 'test' };
      mockRegistryService.getTenantPack.mockResolvedValue(mockTenantPack as any);

      const result = await router.detect(testQuery, contextWithUndefined as any);

      expect(result).toBe('es');
    });
  });

  describe('getLanguagePack', () => {
    it('should delegate to registry service', async () => {
      const testTenantId = 'test-tenant';
      const testLangId = 'fr';
      const mockPack = { id: 'fr', stopwords: ['le', 'la'], synonyms: {}, phraseSlop: 2, fieldMap: {}, normalize: jest.fn(), tokenize: jest.fn() };

      mockRegistryService.getLanguagePack.mockResolvedValue(mockPack as any);

      const result = await router.getLanguagePack(testTenantId, testLangId);

      expect(result).toBe(mockPack);
      expect(mockRegistryService.getLanguagePack).toHaveBeenCalledWith(testTenantId, testLangId);
    });

    it('should handle null result from registry service', async () => {
      const testTenantId = 'test-tenant';
      const testLangId = 'unknown';

      mockRegistryService.getLanguagePack.mockResolvedValue(null);

      const result = await router.getLanguagePack(testTenantId, testLangId);

      expect(result).toBeNull();
    });
  });
});