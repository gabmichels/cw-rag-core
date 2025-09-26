import { LanguagePack, DomainPack } from '../schemas/lexical.js';

export interface ExtractedFeatures {
  core: string[]; // High-IDF tokens + entities
  support: string[]; // Function words
  phrases: string[]; // Collocations
  numbers: string[]; // Normalized numbers/codes
  stats: {
    idfSumCore: number;
    idfSumSupport: number;
    len: number;
  };
}

/**
 * Service for extracting lexical features from queries.
 */
export class FeatureExtractor {
  /**
   * Extract features from query using language and domain packs.
   */
  run(query: string, { languagePack, domainPack }: { languagePack: LanguagePack; domainPack: DomainPack }): ExtractedFeatures {
    const normalized = languagePack.normalize(query);
    const tokens = languagePack.tokenize(normalized);

    // Remove stopwords
    const filteredTokens = tokens.filter(token => !languagePack.stopwords.includes(token));

    // CORE: high-IDF tokens (placeholder: assume IDF > 3.0 for non-stopwords)
    const core = filteredTokens.filter(token => this.isHighIDF(token));

    // SUPPORT: remaining tokens
    const support = tokens.filter(token => !core.includes(token));

    // PHRASES: simple bigrams from filtered tokens
    const phrases = this.extractPhrases(filteredTokens, languagePack);

    // NUMBERS: extract and normalize
    const numbers = this.extractNumbers(normalized, domainPack);

    // Stats (placeholder)
    const idfSumCore = core.length * 4.0; // Mock IDF
    const idfSumSupport = support.length * 1.0;
    const len = tokens.length;

    return {
      core,
      support,
      phrases,
      numbers,
      stats: { idfSumCore, idfSumSupport, len },
    };
  }

  private isHighIDF(token: string): boolean {
    // Placeholder: consider short tokens as high-IDF
    return token.length <= 3 && !['and', 'the', 'or'].includes(token);
  }

  private extractPhrases(tokens: string[], pack: LanguagePack): string[] {
    const phrases: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      // Check if bigram is in synonyms or dictionaries (placeholder)
      if (Object.values(pack.synonyms).some(syns => syns.includes(bigram))) {
        phrases.push(bigram);
      }
    }
    return phrases;
  }

  private extractNumbers(text: string, domainPack: DomainPack): string[] {
    const numbers: string[] = [];
    // Simple regex for numbers
    const numberMatches = text.match(/\b\d+\b/g);
    if (numberMatches) {
      numbers.push(...numberMatches);
    }
    // Check domain patterns
    if (domainPack.numericPatterns) {
      for (const pattern of domainPack.numericPatterns) {
        const matches = text.match(new RegExp(pattern));
        if (matches) {
          numbers.push(...matches);
        }
      }
    }
    return [...new Set(numbers)]; // Unique
  }
}