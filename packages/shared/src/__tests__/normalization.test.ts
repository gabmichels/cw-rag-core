import { canonicalizeForHash, computeSha256, detectLanguage } from '../utils/normalization.js';

describe('Normalization Utils', () => {
  describe('canonicalizeForHash', () => {
    it('should canonicalize string content', () => {
      const input = '  Hello\n\nWorld  ';
      const result = canonicalizeForHash(input);
      expect(result).toBe('Hello\nWorld');
    });

    it('should canonicalize block content', () => {
      const blocks = [
        { type: 'text', text: '  Hello  ' },
        { type: 'code', text: 'console.log("test");' }
      ];
      const result = canonicalizeForHash(blocks as any);
      expect(result).toBe('Hello\nconsole.log("test");');
    });

    it('should handle empty blocks', () => {
      const blocks = [
        { type: 'text', text: '' },
        { type: 'code', text: '  ' }
      ];
      const result = canonicalizeForHash(blocks as any);
      expect(result).toBe('');
    });
  });

  describe('computeSha256', () => {
    it('should compute hash for string', () => {
      const input = 'Hello World';
      const result = computeSha256(input);
      expect(result).toBe('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
      expect(result).toHaveLength(64);
    });

    it('should compute hash for buffer', () => {
      const input = Buffer.from('Hello World', 'utf8');
      const result = computeSha256(input);
      expect(result).toBe('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
    });
  });

  describe('detectLanguage', () => {
    it('should detect German', () => {
      const text = 'Das ist ein Test mit deutschen Wörtern wie Straße und schön';
      const result = detectLanguage(text);
      expect(result).toBe('de');
    });

    it('should detect Spanish', () => {
      const text = 'Esto es una prueba con palabras españolas como español y también';
      const result = detectLanguage(text);
      expect(result).toBe('es');
    });

    it('should detect French', () => {
      const text = 'Le chat est sur le toit et il regarde la lune';
      const result = detectLanguage(text);
      expect(result).toBe('fr');
    });

    it('should detect Italian', () => {
      const text = 'Il mio libro preferito e molto bello e interessante';
      const result = detectLanguage(text);
      expect(result).toBe('it');
    });

    it('should detect Portuguese', () => {
      const text = 'O meu livro preferido e muito bonito e interessante';
      const result = detectLanguage(text);
      expect(result).toBe('pt');
    });

    it('should fallback to English for short text', () => {
      const result = detectLanguage('Hi');
      expect(result).toBe('en');
    });

    it('should fallback to English for empty text', () => {
      const result = detectLanguage('');
      expect(result).toBe('en');
    });

    it('should fallback to English when no language detected', () => {
      const result = detectLanguage('This is a test with common words that do not trigger other languages');
      expect(result).toBe('en');
    });

    it('should prioritize question structure over quoted content', () => {
      const text = 'What is "Das Auto" in English?';
      const result = detectLanguage(text);
      expect(result).toBe('en');
    });

  });
});