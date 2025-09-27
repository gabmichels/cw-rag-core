import { FeatureExtractor, ExtractedFeatures } from '../services/feature-extractor.js';
import { LanguagePack, DomainPack } from '../schemas/lexical.js';

describe('FeatureExtractor', () => {
  let extractor: FeatureExtractor;
  let mockLanguagePack: LanguagePack;
  let mockDomainPack: DomainPack;

  beforeEach(() => {
    extractor = new FeatureExtractor();

    mockLanguagePack = {
      id: 'en',
      stopwords: ['the', 'a', 'an', 'and', 'or'],
      synonyms: {
        'skill': ['ability', 'competence'],
        'test phrase': ['sample phrase'],
      },
      phraseSlop: 2,
      fieldMap: { title: 'title', body: 'content' },
      normalize: jest.fn((text: string) => text.toLowerCase()),
      tokenize: jest.fn((text: string) => text.split(/\s+/)),
    };

    mockDomainPack = {
      id: 'general',
      fieldBoosts: { title: 2.0, body: 1.0 },
      coveragePolicy: { short: 'all', medium: '2', long: '50%' },
      numericPatterns: ['\\b\\d{4}\\b', '\\b\\d+\\.\\d+\\b'],
    };
  });

  describe('run', () => {
    it('should extract features from simple query', () => {
      const query = 'the quick brown fox';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('the quick brown fox');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue(['the', 'quick', 'brown', 'fox']);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.core).toEqual(['fox']); // 'fox' is short (3 chars), not stopword
      expect(result.support).toEqual(['the', 'quick', 'brown']); // stopwords and remaining
      expect(result.phrases).toEqual([]);
      expect(result.numbers).toEqual([]);
      expect(result.stats.idfSumCore).toBe(4.0); // 1 * 4.0
      expect(result.stats.idfSumSupport).toBe(3 * 1.0); // 3 * 1.0
      expect(result.stats.len).toBe(4);
    });

    it('should extract phrases when synonyms match', () => {
      const query = 'skill and test phrase';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('skill and test phrase');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue(['skill', 'and', 'test', 'phrase']);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.phrases).toContain('test phrase');
    });

    it('should extract numbers from query', () => {
      const query = 'version 1.2 and code 1234';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('version 1.2 and code 1234');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue(['version', '1.2', 'and', 'code', '1234']);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.numbers).toEqual(['1.2', '1234']);
    });

    it('should handle empty query', () => {
      const query = '';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue([]);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.core).toEqual([]);
      expect(result.support).toEqual([]);
      expect(result.phrases).toEqual([]);
      expect(result.numbers).toEqual([]);
      expect(result.stats.len).toBe(0);
    });

    it('should handle query with only stopwords', () => {
      const query = 'the and or';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('the and or');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue(['the', 'and', 'or']);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.core).toEqual([]);
      expect(result.support).toEqual(['the', 'and', 'or']);
      expect(result.phrases).toEqual([]);
      expect(result.numbers).toEqual([]);
    });

    it('should handle query with high IDF tokens', () => {
      const query = 'cat dog elephant';
      (mockLanguagePack.normalize as jest.Mock).mockReturnValue('cat dog elephant');
      (mockLanguagePack.tokenize as jest.Mock).mockReturnValue(['cat', 'dog', 'elephant']);

      const result = extractor.run(query, { languagePack: mockLanguagePack, domainPack: mockDomainPack });

      expect(result.core).toEqual(['cat', 'dog']); // 'cat' and 'dog' are 3 chars, 'elephant' is longer
      expect(result.support).toEqual(['elephant']);
    });
  });

  describe('isHighIDF', () => {
    it('should identify short tokens as high IDF', () => {
      expect((extractor as any).isHighIDF('cat')).toBe(true);
      expect((extractor as any).isHighIDF('dog')).toBe(true);
      expect((extractor as any).isHighIDF('hi')).toBe(true);
    });

    it('should not identify long tokens as high IDF', () => {
      expect((extractor as any).isHighIDF('elephant')).toBe(false);
      expect((extractor as any).isHighIDF('hippopotamus')).toBe(false);
    });

    it('should not identify excluded words as high IDF', () => {
      expect((extractor as any).isHighIDF('and')).toBe(false);
      expect((extractor as any).isHighIDF('the')).toBe(false);
      expect((extractor as any).isHighIDF('or')).toBe(false);
    });
  });

  describe('extractPhrases', () => {
    it('should extract bigrams that are in synonyms', () => {
      const tokens = ['skill', 'and', 'test', 'phrase'];
      const result = (extractor as any).extractPhrases(tokens, mockLanguagePack);

      expect(result).toContain('test phrase');
      expect(result).not.toContain('skill and');
    });

    it('should not extract bigrams not in synonyms', () => {
      const tokens = ['hello', 'world', 'foo', 'bar'];
      const result = (extractor as any).extractPhrases(tokens, mockLanguagePack);

      expect(result).toEqual([]);
    });

    it('should handle single token', () => {
      const tokens = ['single'];
      const result = (extractor as any).extractPhrases(tokens, mockLanguagePack);

      expect(result).toEqual([]);
    });
  });

  describe('extractNumbers', () => {
    it('should extract simple numbers', () => {
      const text = 'version 123 and 456.78';
      const result = (extractor as any).extractNumbers(text, mockDomainPack);

      expect(result).toEqual(['123', '456.78']);
    });

    it('should extract numbers matching domain patterns', () => {
      const text = 'code 2023 and value 123.45';
      const result = (extractor as any).extractNumbers(text, mockDomainPack);

      expect(result).toEqual(['2023', '123.45']);
    });

    it('should deduplicate numbers', () => {
      const text = 'number 123 and number 123';
      const result = (extractor as any).extractNumbers(text, mockDomainPack);

      expect(result).toEqual(['123']);
    });

    it('should handle no numbers', () => {
      const text = 'no numbers here';
      const result = (extractor as any).extractNumbers(text, mockDomainPack);

      expect(result).toEqual([]);
    });

    it('should handle domain pack without numeric patterns', () => {
      const domainPackWithoutPatterns = {
        id: 'test',
        fieldBoosts: { title: 1.0 },
        coveragePolicy: { short: 'all', medium: '2', long: '50%' },
      };

      const text = 'version 123';
      const result = (extractor as any).extractNumbers(text, domainPackWithoutPatterns);

      expect(result).toEqual(['123']);
    });
  });
});