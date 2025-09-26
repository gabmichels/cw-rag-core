import { HybridSearchResult } from '../types/hybrid.js';

/**
 * Lightweight answerability scorer for prioritizing answer-bearing chunks
 */
export class AnswerabilityScorer {
  constructor(
    private bonus: number = 0.1 // Base bonus to add to FinalScore
  ) {}

  /**
   * Score answerability features in a chunk
   */
  scoreAnswerability(chunk: HybridSearchResult): number {
    const content = chunk.content || '';
    let score = 0;

    // Numbers/units (measurements, counts, etc.)
    const numberPattern = /\b\d+(\.\d+)?\s*(days?|hours?|minutes?|seconds?|meters?|feet?|inches?|pounds?|kg|tons?|percent|%)\b/gi;
    if (numberPattern.test(content)) score += 0.3;

    // Dates and times
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}|\b\d{4}-\d{2}-\d{2}|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi;
    if (datePattern.test(content)) score += 0.2;

    // Definitions and explanations
    const definitionPattern = /\b(is|are|means|refers to|defined as|represents)\b/gi;
    if (definitionPattern.test(content)) score += 0.25;

    // Lists and enumerations
    const listPattern = /^\s*[-•*]\s+|^\s*\d+\.\s+/gm;
    if (listPattern.test(content)) score += 0.15;

    // Question words in content (likely explanatory)
    const questionWords = /\b(what|how|when|where|why|who|which)\b/gi;
    if (questionWords.test(content)) score += 0.1;

    // Technical terms and proper nouns (but not too many - avoid entity spam)
    const properNouns = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const properNounCount = (content.match(properNouns) || []).length;
    if (properNounCount > 0 && properNounCount <= 3) score += 0.1;

    // Headers and section markers
    if (chunk.payload?.header || chunk.payload?.sectionPath) score += 0.2;

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Apply answerability bonus to FinalScore
   */
  applyBonus(chunk: HybridSearchResult, finalScore: number, query?: string): number {
    const answerability = this.scoreAnswerability(chunk);
    let bonus = this.bonus * answerability;

    // Apply critical answer boost for queries asking for specific measurements
    if (query && this.containsDirectAnswer(chunk, query)) {
      console.log(`🎯 CRITICAL ANSWER BOOST: Chunk ${chunk.id} contains direct answer to query "${query}"`);
      bonus += 0.5; // Significant boost to ensure this chunk gets prioritized
    }

    return finalScore + bonus;
  }

  /**
   * Check if chunk contains direct answer to specific query types
   */
  private containsDirectAnswer(chunk: HybridSearchResult, query: string): boolean {
    const content = chunk.content || '';
    const queryLower = query.toLowerCase();

    // For "how long is a day" type queries, prioritize chunks with "hours" or "minutes"
    if (queryLower.includes('how long') && queryLower.includes('day')) {
      const timePattern = /\b\d+(\.\d+)?\s*(hours?|hrs?|minutes?|mins?)\b/i;
      if (timePattern.test(content)) {
        console.log(`🎯 Direct time answer found in chunk ${chunk.id}: ${content.match(timePattern)?.[0]}`);
        return true;
      }
    }

    // For "how much/many" queries, prioritize chunks with numbers and units
    if (queryLower.includes('how much') || queryLower.includes('how many')) {
      const measurementPattern = /\b\d+(\.\d+)?\s*(days?|hours?|meters?|feet?|kg|pounds?|percent|%)\b/i;
      if (measurementPattern.test(content)) {
        return true;
      }
    }

    // For "what is" queries, prioritize definition-like content
    if (queryLower.includes('what is') || queryLower.includes('what are')) {
      const definitionPattern = /\b(is|are|means|refers to|defined as)\b/i;
      if (definitionPattern.test(content)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if chunk likely contains answer for query
   */
  likelyContainsAnswer(chunk: HybridSearchResult, query: string): boolean {
    const content = chunk.content?.toLowerCase() || '';
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);

    // Must contain at least one query term
    const hasQueryTerm = queryTerms.some(term => content.includes(term));
    if (!hasQueryTerm) return false;

    // Boost if contains numbers when query asks for measurements
    const queryHasNumbers = /\b(how long|how much|how many|what is|what are)\b/i.test(query);
    if (queryHasNumbers && /\d+/.test(content)) return true;

    // Boost if contains definitions when query asks for explanations
    const queryHasDefinition = /\b(what is|what does|what are|how does|explain)\b/i.test(query);
    if (queryHasDefinition && /\b(is|are|means|defined)\b/i.test(content)) return true;

    return true;
  }

  /**
   * Update bonus weight
   */
  setBonus(bonus: number): void {
    this.bonus = Math.max(0, Math.min(0.5, bonus)); // Reasonable bounds
  }
}

/**
 * Factory for answerability scorer
 */
export function createAnswerabilityScorer(
  bonus: number = parseFloat(process.env.PACKING_ANSWERABILITY_BONUS || '0.1')
): AnswerabilityScorer {
  return new AnswerabilityScorer(bonus);
}