/**
 * Judgers for evaluating retrieval quality
 */

import { GoldenTestCase, RetrievalResult, EvaluationResult } from '../types/eval.js';

export class RetrievalJudger {
  /**
   * Judge retrieval quality against golden test case
   */
  judge(testCase: GoldenTestCase, result: RetrievalResult): EvaluationResult {
    const retrievedDocIds = result.retrievedChunks.map(chunk => chunk.docId);
    const expectedDocIds = testCase.expectedChunks;

    // Calculate precision and recall
    const relevantRetrieved = retrievedDocIds.filter(id => expectedDocIds.includes(id)).length;
    const precision = result.retrievedChunks.length > 0 ? relevantRetrieved / result.retrievedChunks.length : 0;
    const recall = expectedDocIds.length > 0 ? relevantRetrieved / expectedDocIds.length : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Calculate NDCG
    const ndcg = this.calculateNDCG(result.retrievedChunks, expectedDocIds);

    // Calculate MRR
    const mrr = this.calculateMRR(result.retrievedChunks, expectedDocIds);

    // Determine if answerable (has at least one relevant chunk in top results)
    const answerable = relevantRetrieved > 0;
    const confidence = Math.min(result.retrievedChunks[0]?.score || 0, 1.0);

    return {
      testCase,
      result,
      scores: {
        precision,
        recall,
        f1,
        ndcg,
        mrr
      },
      judgments: {
        relevantChunksFound: relevantRetrieved,
        totalRelevantChunks: expectedDocIds.length,
        answerable,
        confidence
      }
    };
  }

  /**
   * Calculate Normalized Discounted Cumulative Gain
   */
  private calculateNDCG(retrievedChunks: RetrievalResult['retrievedChunks'], expectedDocIds: string[]): number {
    if (retrievedChunks.length === 0) return 0;

    let dcg = 0;
    let idcg = 0;

    // Calculate DCG
    for (let i = 0; i < retrievedChunks.length; i++) {
      const chunk = retrievedChunks[i];
      const relevance = expectedDocIds.includes(chunk.docId) ? 1 : 0;
      dcg += relevance / Math.log2(i + 2); // i + 2 because positions start from 1
    }

    // Calculate IDCG (ideal DCG)
    const relevantCount = Math.min(expectedDocIds.length, retrievedChunks.length);
    for (let i = 0; i < relevantCount; i++) {
      idcg += 1 / Math.log2(i + 2);
    }

    return idcg > 0 ? dcg / idcg : 0;
  }

  /**
   * Calculate Mean Reciprocal Rank
   */
  private calculateMRR(retrievedChunks: RetrievalResult['retrievedChunks'], expectedDocIds: string[]): number {
    for (let i = 0; i < retrievedChunks.length; i++) {
      if (expectedDocIds.includes(retrievedChunks[i].docId)) {
        return 1 / (i + 1); // Position starts from 1
      }
    }
    return 0;
  }

  /**
   * Judge multiple results
   */
  judgeBatch(testCases: GoldenTestCase[], results: RetrievalResult[]): EvaluationResult[] {
    return testCases.map((testCase, index) => {
      const result = results[index];
      if (!result) {
        throw new Error(`Missing result for test case ${testCase.id}`);
      }
      return this.judge(testCase, result);
    });
  }
}

export class ContextualJudger extends RetrievalJudger {
  /**
   * Enhanced judging that considers content relevance beyond just docId matching
   */
  judge(testCase: GoldenTestCase, result: RetrievalResult): EvaluationResult {
    const baseResult = super.judge(testCase, result);

    // Additional content-based scoring
    const contentRelevance = this.calculateContentRelevance(testCase, result);
    const semanticSimilarity = this.calculateSemanticSimilarity(testCase, result);

    // Adjust scores based on content analysis
    const adjustedScores = {
      ...baseResult.scores,
      precision: (baseResult.scores.precision + contentRelevance) / 2,
      recall: (baseResult.scores.recall + semanticSimilarity) / 2,
      f1: (baseResult.scores.f1 + (contentRelevance + semanticSimilarity) / 2) / 2
    };

    return {
      ...baseResult,
      scores: adjustedScores
    };
  }

  private calculateContentRelevance(testCase: GoldenTestCase, result: RetrievalResult): number {
    // Simple keyword matching for content relevance
    const queryWords = testCase.query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    let totalRelevance = 0;

    for (const chunk of result.retrievedChunks) {
      const content = chunk.content.toLowerCase();
      const matchingWords = queryWords.filter(word => content.includes(word)).length;
      totalRelevance += matchingWords / queryWords.length;
    }

    return result.retrievedChunks.length > 0 ? totalRelevance / result.retrievedChunks.length : 0;
  }

  private calculateSemanticSimilarity(testCase: GoldenTestCase, result: RetrievalResult): number {
    // Placeholder for semantic similarity - would use embeddings in real implementation
    // For now, return a score based on whether expected chunks are present
    const expectedFound = result.retrievedChunks.filter(chunk =>
      testCase.expectedChunks.includes(chunk.docId)
    ).length;

    return testCase.expectedChunks.length > 0 ? expectedFound / testCase.expectedChunks.length : 0;
  }
}