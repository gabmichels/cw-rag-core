import { QueryBuilder } from '../services/query-builder.js';
import { ExtractedFeatures } from '../services/feature-extractor.js';
import { TenantPack, DomainPack, LanguagePack } from '../schemas/lexical.js';

describe('QueryBuilder', () => {
  let builder: QueryBuilder;
  let mockTenantPack: TenantPack;
  let mockDomainPack: DomainPack;
  let mockLanguagePack: LanguagePack;

  beforeEach(() => {
    builder = new QueryBuilder();

    mockTenantPack = {
      id: 'test-tenant',
      domainId: 'general',
      languageDefault: 'en',
      systemPrompt: 'Test prompt',
    };

    mockDomainPack = {
      id: 'general',
      fieldBoosts: { title: 2.0, body: 1.0, tags: 1.5 },
      coveragePolicy: { short: 'all', medium: '2', long: '50%' },
    };

    mockLanguagePack = {
      id: 'en',
      stopwords: ['the', 'a', 'an'],
      synonyms: {},
      phraseSlop: 2,
      fieldMap: { title: 'title', body: 'content' },
      normalize: jest.fn(),
      tokenize: jest.fn(),
    };
  });

  describe('build', () => {
    it('should build query with core terms only', () => {
      const features: ExtractedFeatures = {
        core: ['machine', 'learning'],
        support: ['the', 'and'],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 8.0, idfSumSupport: 2.0, len: 4 },
      };

      const result = builder.build(features, { tenantPack: mockTenantPack, languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toEqual({
        key: 'content',
        match: { any: ['machine', 'learning'] },
      });
      expect(result.scoring.fieldBoosts).toEqual({ title: 2.0, body: 1.0, tags: 1.5 });
      expect(result.scoring.supportPenalty).toBe(2 * 0.1); // 2 support terms * 0.1
    });

    it('should build query with phrases', () => {
      const features: ExtractedFeatures = {
        core: ['test'],
        support: [],
        phrases: ['machine learning', 'artificial intelligence'],
        numbers: [],
        stats: { idfSumCore: 4.0, idfSumSupport: 0, len: 3 },
      };

      const result = builder.build(features, { tenantPack: mockTenantPack, languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.filters).toHaveLength(3); // core + 2 phrases
      expect(result.filters[0]).toEqual({
        key: 'content',
        match: { any: ['test'] },
      });
      expect(result.filters[1]).toEqual({
        key: 'content',
        match: { value: 'machine learning' },
      });
      expect(result.filters[2]).toEqual({
        key: 'content',
        match: { value: 'artificial intelligence' },
      });
    });

    it('should build query with numbers', () => {
      const features: ExtractedFeatures = {
        core: [],
        support: [],
        phrases: [],
        numbers: ['2023', '1.5'],
        stats: { idfSumCore: 0, idfSumSupport: 0, len: 2 },
      };

      const result = builder.build(features, { tenantPack: mockTenantPack, languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toEqual({
        key: 'content',
        match: { any: ['2023', '1.5'] },
      });
    });

    it('should handle empty features', () => {
      const features: ExtractedFeatures = {
        core: [],
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 0, idfSumSupport: 0, len: 0 },
      };

      const result = builder.build(features, { tenantPack: mockTenantPack, languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.filters).toEqual([]);
      expect(result.scoring.supportPenalty).toBeUndefined();
    });

    it('should combine all feature types', () => {
      const features: ExtractedFeatures = {
        core: ['algorithm'],
        support: ['the', 'is'],
        phrases: ['neural network'],
        numbers: ['99.9'],
        stats: { idfSumCore: 4.0, idfSumSupport: 2.0, len: 5 },
      };

      const result = builder.build(features, { tenantPack: mockTenantPack, languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.filters).toHaveLength(3);
      expect(result.scoring.supportPenalty).toBe(2 * 0.1);
    });
  });

  describe('getCoveragePolicy', () => {
    it('should return short policy for few core terms', () => {
      const features: ExtractedFeatures = {
        core: ['test'],
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 4.0, idfSumSupport: 0, len: 1 },
      };

      const result = (builder as any).getCoveragePolicy(features, mockDomainPack);

      expect(result.minCore).toBe(1); // 'all' means all core terms
      expect(result.policy).toBe('all');
    });

    it('should return medium policy for medium core terms', () => {
      const features: ExtractedFeatures = {
        core: ['test', 'machine', 'learning', 'algorithm'],
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 16.0, idfSumSupport: 0, len: 4 },
      };

      const result = (builder as any).getCoveragePolicy(features, mockDomainPack);

      expect(result.minCore).toBe(2); // '2' parsed as number
      expect(result.policy).toBe('2');
    });

    it('should return long policy for many core terms', () => {
      const features: ExtractedFeatures = {
        core: Array(15).fill('term'), // 15 terms
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 60.0, idfSumSupport: 0, len: 15 },
      };

      const result = (builder as any).getCoveragePolicy(features, mockDomainPack);

      expect(result.minCore).toBe(7); // 15 * 0.5 = 7.5, floored to 7
      expect(result.policy).toBe('50%');
    });

    it('should handle percentage policy correctly', () => {
      const domainPackWithPercentage = {
        ...mockDomainPack,
        coveragePolicy: { short: 'all', medium: '25%', long: '50%' },
      };

      const features: ExtractedFeatures = {
        core: Array(8).fill('term'), // 8 terms
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 32.0, idfSumSupport: 0, len: 8 },
      };

      const result = (builder as any).getCoveragePolicy(features, domainPackWithPercentage);

      expect(result.minCore).toBe(2); // 8 * 0.25 = 2
      expect(result.policy).toBe('25%');
    });

    it('should handle edge case of exactly 3 core terms', () => {
      const features: ExtractedFeatures = {
        core: ['a', 'b', 'c'],
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 12.0, idfSumSupport: 0, len: 3 },
      };

      const result = (builder as any).getCoveragePolicy(features, mockDomainPack);

      expect(result.minCore).toBe(3); // 'all' means all 3
      expect(result.policy).toBe('all');
    });

    it('should handle edge case of exactly 10 core terms', () => {
      const features: ExtractedFeatures = {
        core: Array(10).fill('term'),
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 40.0, idfSumSupport: 0, len: 10 },
      };

      const result = (builder as any).getCoveragePolicy(features, mockDomainPack);

      expect(result.minCore).toBe(2); // medium policy '2'
      expect(result.policy).toBe('2');
    });

    it('should handle short policy with percentage', () => {
      const domainPackWithShortPercent = {
        ...mockDomainPack,
        coveragePolicy: { short: '100%', medium: '2', long: '50%' },
      };

      const features: ExtractedFeatures = {
        core: ['a', 'b', 'c'],
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 12.0, idfSumSupport: 0, len: 3 },
      };

      const result = (builder as any).getCoveragePolicy(features, domainPackWithShortPercent);

      expect(result.minCore).toBe(3); // 3 * 1.0 = 3
      expect(result.policy).toBe('100%');
    });

    it('should handle long policy with number', () => {
      const domainPackWithLongNumber = {
        ...mockDomainPack,
        coveragePolicy: { short: 'all', medium: '2', long: '3' },
      };

      const features: ExtractedFeatures = {
        core: Array(12).fill('term'),
        support: [],
        phrases: [],
        numbers: [],
        stats: { idfSumCore: 48.0, idfSumSupport: 0, len: 12 },
      };

      const result = (builder as any).getCoveragePolicy(features, domainPackWithLongNumber);

      expect(result.minCore).toBe(3);
      expect(result.policy).toBe('3');
    });
  });
});