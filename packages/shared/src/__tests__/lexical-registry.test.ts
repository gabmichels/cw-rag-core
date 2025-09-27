import { LexicalRegistryService } from '../services/lexical-registry.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock path
jest.mock('path');
const mockPath = path as jest.Mocked<typeof path>;

describe('LexicalRegistryService', () => {
  let service: LexicalRegistryService;
  const testTenantId = 'test-tenant';
  const testRegistryDir = './test-tenants';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LexicalRegistryService(testRegistryDir);

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));
  });

  describe('constructor', () => {
    it('should set registry directory', () => {
      const customDir = './custom-dir';
      const customService = new LexicalRegistryService(customDir);
      expect(customService).toBeInstanceOf(LexicalRegistryService);
    });

    it('should use default registry directory', () => {
      const defaultService = new LexicalRegistryService();
      expect(defaultService).toBeInstanceOf(LexicalRegistryService);
    });
  });

  describe('loadRegistry', () => {
    it('should load existing registry file', async () => {
      const mockYamlContent = `
tenantId: ${testTenantId}
languagePacks:
  en:
    id: en
    stopwords: [the, and, or]
    synonyms: {}
    phraseSlop: 2
    fieldMap: {title: title, body: content}
domainPacks:
  general:
    id: general
    fieldBoosts: {title: 2.0, body: 1.0}
    coveragePolicy: {short: all, medium: '2', long: '50%'}
tenantPack:
  id: ${testTenantId}
  domainId: general
  languageDefault: en
  systemPrompt: 'Test prompt'
version: '1.0'
`;

      mockFs.readFile.mockResolvedValue(mockYamlContent);

      const registry = await service.loadRegistry(testTenantId);

      expect(mockFs.readFile).toHaveBeenCalledWith(`${testRegistryDir}/${testTenantId}/lexical.yaml`, 'utf-8');
      expect(registry.tenantId).toBe(testTenantId);
      expect(registry.languagePacks.en).toBeDefined();
      expect(typeof registry.languagePacks.en.normalize).toBe('function');
      expect(typeof registry.languagePacks.en.tokenize).toBe('function');
    });

    it('should create default registry when file does not exist', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const registry = await service.loadRegistry(testTenantId);

      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(registry.tenantId).toBe(testTenantId);
      expect(registry.languagePacks.en).toBeDefined();
      expect(registry.languagePacks.de).toBeDefined();
    });

    it('should throw error for tenant ID mismatch', async () => {
      const mockYamlContent = `
tenantId: wrong-tenant
languagePacks: {}
domainPacks: {}
tenantPack: {id: wrong-tenant, domainId: general, languageDefault: en, systemPrompt: ''}
version: '1.0'
`;

      mockFs.readFile.mockResolvedValue(mockYamlContent);

      await expect(service.loadRegistry(testTenantId)).rejects.toThrow('Registry tenant mismatch');
    });

    it('should throw error for invalid YAML', async () => {
      mockFs.readFile.mockResolvedValue('invalid: yaml: content: [');

      await expect(service.loadRegistry(testTenantId)).rejects.toThrow();
    });

    it('should rethrow non-ENOENT errors', async () => {
      const error = new Error('Permission denied');
      mockFs.readFile.mockRejectedValue(error);

      await expect(service.loadRegistry(testTenantId)).rejects.toThrow('Permission denied');
    });
  });

  describe('saveRegistry', () => {
    it('should save registry to file', async () => {
      const registry = {
        tenantId: testTenantId,
        languagePacks: {
          en: {
            id: 'en',
            stopwords: ['the'],
            synonyms: {},
            phraseSlop: 2,
            fieldMap: { title: 'title', body: 'content' },
            normalize: jest.fn(),
            tokenize: jest.fn()
          }
        },
        domainPacks: {
          general: {
            id: 'general',
            fieldBoosts: { title: 2.0, body: 1.0 },
            coveragePolicy: { short: 'all', medium: '2', long: '50%' }
          }
        },
        tenantPack: {
          id: testTenantId,
          domainId: 'general',
          languageDefault: 'en',
          systemPrompt: 'Test prompt'
        },
        version: '1.0'
      };

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await service.saveRegistry(registry);

      expect(mockFs.mkdir).toHaveBeenCalledWith(`${testRegistryDir}/${testTenantId}`, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${testRegistryDir}/${testTenantId}/lexical.yaml`,
        expect.stringContaining(`tenantId: ${testTenantId}`),
        'utf-8'
      );
    });
  });

  describe('getLanguagePack', () => {
    it('should return language pack if exists', async () => {
      const mockRegistry = {
        tenantId: testTenantId,
        languagePacks: {
          en: { id: 'en', stopwords: ['the'], synonyms: {}, phraseSlop: 2, fieldMap: {}, normalize: jest.fn(), tokenize: jest.fn() }
        },
        domainPacks: {},
        tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
        version: '1.0'
      };

      jest.spyOn(service, 'loadRegistry').mockResolvedValue(mockRegistry);

      const pack = await service.getLanguagePack(testTenantId, 'en');
      expect(pack).toBe(mockRegistry.languagePacks.en);
    });

    it('should return null if language pack does not exist', async () => {
      const mockRegistry = {
        tenantId: testTenantId,
        languagePacks: {},
        domainPacks: {},
        tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
        version: '1.0'
      };

      jest.spyOn(service, 'loadRegistry').mockResolvedValue(mockRegistry);

      const pack = await service.getLanguagePack(testTenantId, 'fr');
      expect(pack).toBeNull();
    });
  });

  describe('getDomainPack', () => {
    it('should return domain pack if exists', async () => {
      const mockRegistry = {
        tenantId: testTenantId,
        languagePacks: {},
        domainPacks: {
          knowledge: { id: 'knowledge', fieldBoosts: { title: 3.0 }, coveragePolicy: { short: 'all', medium: '2', long: '50%' } }
        },
        tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
        version: '1.0'
      };

      jest.spyOn(service, 'loadRegistry').mockResolvedValue(mockRegistry);

      const pack = await service.getDomainPack(testTenantId, 'knowledge');
      expect(pack).toBe(mockRegistry.domainPacks.knowledge);
    });

    it('should return null if domain pack does not exist', async () => {
      const mockRegistry = {
        tenantId: testTenantId,
        languagePacks: {},
        domainPacks: {},
        tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: '' },
        version: '1.0'
      };

      jest.spyOn(service, 'loadRegistry').mockResolvedValue(mockRegistry);

      const pack = await service.getDomainPack(testTenantId, 'unknown');
      expect(pack).toBeNull();
    });
  });

  describe('getTenantPack', () => {
    it('should return tenant pack', async () => {
      const mockRegistry = {
        tenantId: testTenantId,
        languagePacks: {},
        domainPacks: {},
        tenantPack: { id: testTenantId, domainId: 'general', languageDefault: 'en', systemPrompt: 'test' },
        version: '1.0'
      };

      jest.spyOn(service, 'loadRegistry').mockResolvedValue(mockRegistry);

      const pack = await service.getTenantPack(testTenantId);
      expect(pack).toBe(mockRegistry.tenantPack);
    });
  });

  describe('private methods', () => {
    describe('normalizeText', () => {
      it('should normalize English text', () => {
        const result = (service as any).normalizeText('Hello World!', 'en');
        expect(result).toBe('hello world!');
      });

      it('should normalize German text with umlauts', () => {
        const result = (service as any).normalizeText('Schöne Straße', 'de');
        expect(result).toBe('schoene strasse');
      });

      it('should normalize German text with ß', () => {
        const result = (service as any).normalizeText('Fußball', 'de');
        expect(result).toBe('fussball');
      });
    });

    describe('tokenizeText', () => {
      it('should tokenize text', () => {
        const result = (service as any).tokenizeText('hello, world! test', 'en');
        expect(result).toEqual(['hello', 'world', 'test']);
      });

      it('should filter out empty tokens', () => {
        const result = (service as any).tokenizeText('hello   world', 'en');
        expect(result).toEqual(['hello', 'world']);
      });
    });

    describe('decompoundGerman', () => {
      it('should decompound long German words', () => {
        const result = (service as any).decompoundGerman('Donaudampfschiffahrtsgesellschaft');
        expect(result).toEqual(['Donaudampfschiff', 'ahrtsgesellschaft']);
      });

      it('should not decompound short words', () => {
        const result = (service as any).decompoundGerman('Haus');
        expect(result).toEqual(['Haus']);
      });
    });

    describe('addFunctionsToLanguagePacks', () => {
      it('should add functions to language packs', () => {
        const packs = {
          en: { id: 'en', stopwords: ['the'], synonyms: {}, phraseSlop: 2, fieldMap: {} },
          de: { id: 'de', stopwords: ['der'], synonyms: {}, phraseSlop: 2, fieldMap: {} }
        };

        const result = (service as any).addFunctionsToLanguagePacks(packs);

        expect(typeof result.en.normalize).toBe('function');
        expect(typeof result.en.tokenize).toBe('function');
        expect(typeof result.de.decompound).toBe('function');
        expect(result.en.decompound).toBeUndefined();
      });
    });

    describe('removeFunctionsFromLanguagePacks', () => {
      it('should remove functions from language packs', () => {
        const packs = {
          en: {
            id: 'en',
            stopwords: ['the'],
            synonyms: {},
            phraseSlop: 2,
            fieldMap: {},
            normalize: jest.fn(),
            tokenize: jest.fn()
          }
        };

        const result = (service as any).removeFunctionsFromLanguagePacks(packs);

        expect(result.en.normalize).toBeUndefined();
        expect(result.en.tokenize).toBeUndefined();
        expect(result.en.id).toBe('en');
      });
    });
  });
});