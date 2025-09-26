/**
 * Domain-agnostic keyphrase extraction using unsupervised methods
 */

export interface QueryTerms {
  phrases: string[];          // ordered by importance
  tokens: string[];           // filtered non-stopword tokens
}

export interface CorpusStats {
  idf: Map<string, number>;
  cooc: Map<string, Map<string, number>>;
  pmi: Map<string, Map<string, number>>;
}

/**
 * Simple stopword list for English (can be extended for other languages)
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 'its',
  'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'but', 'or', 'not', 'this', 'these',
  'those', 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'me', 'my', 'your', 'his', 'her', 'our', 'their',
  'what', 'when', 'where', 'why', 'how', 'who', 'which', 'can', 'could', 'would', 'should', 'may',
  'might', 'must', 'do', 'does', 'did', 'have', 'had', 'been', 'being', 'am', 'is', 'are', 'was', 'were'
]);

/**
 * Extract keyphrases from query using unsupervised methods
 */
export function extractQueryTerms(q: string, corpusStats: CorpusStats): QueryTerms {
  const query = q.toLowerCase().trim();

  // Extract noun phrases using simple heuristics
  const nounPhrases = extractNounPhrases(query);

  // Score phrases using TextRank-like algorithm
  const scoredPhrases = scorePhrases(nounPhrases, corpusStats);

  // Sort by score and take top phrases
  const topPhrases = scoredPhrases
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, scoredPhrases.length))
    .map(item => item.phrase);

  // Extract informative tokens
  const tokens = extractInformativeTokens(query, corpusStats);

  return {
    phrases: topPhrases,
    tokens: tokens
  };
}

/**
 * Extract noun phrases using capitalization and punctuation heuristics
 */
function extractNounPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Split by punctuation and whitespace
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);

    // Extract consecutive capitalized words (potential proper nouns)
    let currentPhrase: string[] = [];
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '');
      if (cleanWord.length === 0) continue;

      // Start new phrase if word starts with capital (potential noun)
      if (cleanWord[0] === cleanWord[0].toUpperCase() && cleanWord.length > 1) {
        if (currentPhrase.length > 0) {
          phrases.push(currentPhrase.join(' '));
        }
        currentPhrase = [cleanWord];
      } else if (currentPhrase.length > 0) {
        // Continue current phrase
        currentPhrase.push(cleanWord);
      }
    }

    // Add remaining phrase
    if (currentPhrase.length > 0) {
      phrases.push(currentPhrase.join(' '));
    }

    // Extract 2-3 word sequences that don't start with stopwords
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i].replace(/[^\w]/g, '');
      const word2 = words[i + 1]?.replace(/[^\w]/g, '');

      if (!word1 || !word2) continue;

      // Skip if starts with stopword
      if (STOPWORDS.has(word1.toLowerCase())) continue;

      // 2-word phrase
      if (!STOPWORDS.has(word2.toLowerCase())) {
        phrases.push(`${word1} ${word2}`);
      }

      // 3-word phrase if available
      const word3 = words[i + 2]?.replace(/[^\w]/g, '');
      if (word3 && !STOPWORDS.has(word3.toLowerCase())) {
        phrases.push(`${word1} ${word2} ${word3}`);
      }
    }
  }

  // Extract single capitalized words as potential noun phrases
  const words = text.split(/\s+/).map(word => word.replace(/[^\w]/g, '')).filter(word => word.length > 0);
  for (const word of words) {
    if (word.length >= 3 &&
        word[0] === word[0].toUpperCase() &&
        !STOPWORDS.has(word.toLowerCase())) {
      phrases.push(word);
    }
  }

  // Remove duplicates and filter
  return [...new Set(phrases)].filter(phrase =>
    phrase.length >= 3 && // At least 3 characters
    !phrase.split(/\s+/).every(word => STOPWORDS.has(word.toLowerCase())) // Not all stopwords
  );
}

/**
 * Score phrases using IDF-weighted frequency and co-occurrence
 */
function scorePhrases(phrases: string[], corpusStats: CorpusStats): Array<{phrase: string, score: number}> {
  return phrases.map(phrase => {
    const words = phrase.split(/\s+/);
    let score = 0;

    // Base score from individual word IDFs
    for (const word of words) {
      const idf = corpusStats.idf.get(word.toLowerCase()) || 1.0;
      score += Math.log(1 + idf); // Smooth IDF score
    }

    // Bonus for phrases that co-occur frequently
    if (words.length === 2) {
      const [w1, w2] = words.map(w => w.toLowerCase());
      const cooc = corpusStats.cooc.get(w1)?.get(w2) || 0;
      if (cooc > 0) {
        score += Math.log(1 + cooc) * 0.5; // Co-occurrence bonus
      }
    }

    // Length bonus (prefer longer phrases)
    score += words.length * 0.1;

    return { phrase, score };
  });
}

/**
 * Extract informative tokens after stopword removal and IDF filtering
 */
function extractInformativeTokens(text: string, corpusStats: CorpusStats): string[] {
  const words = text.toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^\w]/g, ''))
    .filter(word => word.length > 2 && !STOPWORDS.has(word));

  // Score tokens by IDF and take top ones
  const scoredTokens = words.map(word => ({
    token: word,
    score: corpusStats.idf.get(word) || 1.0
  }));

  return scoredTokens
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(10, scoredTokens.length))
    .map(item => item.token);
}