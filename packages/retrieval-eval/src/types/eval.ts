/**
 * Types for the evaluation harness
 */

export interface GoldenTestCase {
  id: string;
  query: string;
  expectedAnswer: string;
  expectedChunks: string[]; // docIds that should be retrieved
  category: 'factual' | 'procedural' | 'entity_lookup' | 'exploratory';
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

export interface RetrievalResult {
  queryId: string;
  retrievedChunks: Array<{
    id: string;
    score: number;
    content: string;
    docId: string;
    rank: number;
  }>;
  metrics: {
    totalTime: number;
    vectorSearchTime: number;
    keywordSearchTime: number;
    fusionTime: number;
    rerankerTime: number;
  };
}

export interface EvaluationResult {
  testCase: GoldenTestCase;
  result: RetrievalResult;
  scores: {
    precision: number;
    recall: number;
    f1: number;
    ndcg: number;
    mrr: number;
  };
  judgments: {
    relevantChunksFound: number;
    totalRelevantChunks: number;
    answerable: boolean;
    confidence: number;
  };
}

export interface ABTestConfig {
  name: string;
  description: string;
  baseline: RetrievalConfig;
  candidate: RetrievalConfig;
  testCases: GoldenTestCase[];
  metrics: string[];
}

export interface RetrievalConfig {
  name: string;
  vectorWeight: number;
  keywordWeight: number;
  rrfK: number;
  enableKeywordSearch: boolean;
  rerankerEnabled: boolean;
  retrievalK: number;
  mmrEnabled: boolean;
  adaptiveWeighting: boolean;
}

export interface EvaluationReport {
  testRunId: string;
  timestamp: string;
  config: ABTestConfig;
  results: EvaluationResult[];
  summary: {
    avgPrecision: number;
    avgRecall: number;
    avgF1: number;
    avgNDCG: number;
    avgMRR: number;
    totalQueries: number;
    answerableQueries: number;
  };
  comparisons: {
    baselineWins: number;
    candidateWins: number;
    ties: number;
    significantImprovements: string[];
  };
}