import { HybridSearchResult } from '../types/hybrid.js';
import { VectorSearchResult } from '../types/vector.js';

export type FusionStrategyName =
  | "score_weighted_rrf"   // score * 1/(rank+k)
  | "weighted_average"     // normalized weighted average (default)
  | "max_confidence"       // safety fallback
  | "borda_rank";          // optional, rank-only for debugging

export interface FusionConfig {
  strategy: FusionStrategyName;
  kParam?: number;              // only used by *_rrf or rank strategies
  vectorWeight: number;         // 0..1
  keywordWeight: number;        // 0..1
  normalization: "zscore" | "minmax" | "none";
}

export interface FusionResult {
  id: string;
  fusedScore: number;
  components: {
    vector?: number;
    keyword?: number;
    rankBlend?: number;
  };
}

export interface FusionInput {
  id: string;
  score: number;
  rank: number;
  docId?: string;
  originalRank?: number; // Added for RRF calculations
}

/**
 * Main fusion function with pluggable strategies
 */
export function fuse(
  vector: FusionInput[],
  keyword: FusionInput[],
  cfg: FusionConfig
): FusionResult[] {
  // Auto-detect high-confidence scenarios and override strategy
  const topVectorScore = vector.length > 0 ? Math.max(...vector.map(v => v.score)) : 0;
  const effectiveStrategy = (cfg.strategy === "weighted_average" && topVectorScore >= 0.75) ?
    "max_confidence" : cfg.strategy;

  // Normalize scores if required
  const normalizedVector = cfg.normalization !== "none" ?
    normalizeScores(vector, cfg.normalization) : vector;
  const normalizedKeyword = cfg.normalization !== "none" ?
    normalizeScores(keyword, cfg.normalization) : keyword;

  // Create lookup maps
  const vectorMap = new Map(normalizedVector.map((v, i) => [v.id, { ...v, originalRank: i + 1 }]));
  const keywordMap = new Map(normalizedKeyword.map((k, i) => [k.id, { ...k, originalRank: i + 1 }]));

  // Get all unique IDs
  const allIds = new Set([...vectorMap.keys(), ...keywordMap.keys()]);

  const results: FusionResult[] = [];

  for (const id of allIds) {
    const vEntry = vectorMap.get(id);
    const kEntry = keywordMap.get(id);

    let fusedScore = 0;
    const components: FusionResult['components'] = {};

    switch (effectiveStrategy) {
      case "weighted_average":
        fusedScore = fuseWeightedAverage(vEntry, kEntry, cfg, components);
        break;

      case "score_weighted_rrf":
        fusedScore = fuseScoreWeightedRRF(vEntry, kEntry, cfg, components);
        break;

      case "max_confidence":
        fusedScore = fuseMaxConfidence(vEntry, kEntry, cfg, components);
        break;

      case "borda_rank":
        fusedScore = fuseBordaRank(vEntry, kEntry, cfg, components);
        break;

      default:
        throw new Error(`Unknown fusion strategy: ${effectiveStrategy}`);
    }

    results.push({
      id,
      fusedScore,
      components
    });
  }

  // Sort by fused score descending
  results.sort((a, b) => b.fusedScore - a.fusedScore);

  return results;
}

/**
 * Weighted average fusion strategy (default)
 */
function fuseWeightedAverage(
  vector: FusionInput | undefined,
  keyword: FusionInput | undefined,
  cfg: FusionConfig,
  components: FusionResult['components']
): number {
  let fusedScore = 0;

  if (vector) {
    components.vector = vector.score;
    fusedScore += cfg.vectorWeight * vector.score;
  }

  if (keyword) {
    components.keyword = keyword.score;
    fusedScore += cfg.keywordWeight * keyword.score;
  }

  // If only one side has results, use it fully
  if (vector && !keyword) {
    fusedScore = cfg.vectorWeight * vector.score;
  } else if (!vector && keyword) {
    fusedScore = cfg.keywordWeight * keyword.score;
  }

  return fusedScore;
}

/**
 * Score-weighted RRF fusion strategy
 */
function fuseScoreWeightedRRF(
  vector: FusionInput | undefined,
  keyword: FusionInput | undefined,
  cfg: FusionConfig,
  components: FusionResult['components']
): number {
  const k = cfg.kParam || 60;
  let fusedScore = 0;

  if (vector) {
    const rankScore = 1 / ((vector.originalRank ?? vector.rank) + k);
    components.vector = vector.score * rankScore;
    components.rankBlend = rankScore;
    fusedScore += cfg.vectorWeight * vector.score * rankScore;
  }

  if (keyword) {
    const rankScore = 1 / ((keyword.originalRank ?? keyword.rank) + k);
    components.keyword = keyword.score * rankScore;
    components.rankBlend = rankScore;
    fusedScore += cfg.keywordWeight * keyword.score * rankScore;
  }

  return fusedScore;
}

/**
 * Max confidence fusion strategy (safety fallback)
 */
function fuseMaxConfidence(
  vector: FusionInput | undefined,
  keyword: FusionInput | undefined,
  cfg: FusionConfig,
  components: FusionResult['components']
): number {
  let maxScore = 0;
  let tieBreaker = 0;

  if (vector) {
    components.vector = vector.score;
    if (vector.score > maxScore) {
      maxScore = vector.score;
      tieBreaker = vector.score; // Higher raw score wins ties
    }
  }

  if (keyword) {
    components.keyword = keyword.score;
    if (keyword.score > maxScore) {
      maxScore = keyword.score;
      tieBreaker = keyword.score;
    } else if (keyword.score === maxScore) {
      // Tie-break on higher raw normalized score
      tieBreaker = Math.max(tieBreaker, keyword.score);
    }
  }

  return maxScore;
}

/**
 * Borda rank fusion strategy (rank-only for debugging)
 */
function fuseBordaRank(
  vector: FusionInput | undefined,
  keyword: FusionInput | undefined,
  cfg: FusionConfig,
  components: FusionResult['components']
): number {
  const k = cfg.kParam || 60;
  let fusedScore = 0;

  if (vector) {
    const rankScore = 1 / ((vector.originalRank ?? vector.rank) + k);
    components.rankBlend = rankScore;
    fusedScore += cfg.vectorWeight * rankScore;
  }

  if (keyword) {
    const rankScore = 1 / ((keyword.originalRank ?? keyword.rank) + k);
    components.rankBlend = rankScore;
    fusedScore += cfg.keywordWeight * rankScore;
  }

  return fusedScore;
}

/**
 * Normalize scores using specified method
 */
function normalizeScores(
  items: FusionInput[],
  method: "zscore" | "minmax"
): FusionInput[] {
  if (items.length === 0) return items;
  if (items.length === 1) return [{ ...items[0], score: 0.5 }]; // Default for single item

  const scores = items.map(item => item.score);

  if (method === "minmax") {
    return minMaxNormalize(items, scores);
  } else if (method === "zscore") {
    return zScoreNormalize(items, scores);
  }

  return items;
}

/**
 * Min-max normalization to [0,1]
 */
function minMaxNormalize(items: FusionInput[], scores: number[]): FusionInput[] {
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;

  if (range === 0) {
    // All scores are the same, return 0.5 for all
    return items.map(item => ({ ...item, score: 0.5 }));
  }

  return items.map(item => ({
    ...item,
    score: (item.score - minScore) / range
  }));
}

/**
 * Z-score normalization
 */
function zScoreNormalize(items: FusionInput[], scores: number[]): FusionInput[] {
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    // All scores are the same, return 0.5 for all
    return items.map(item => ({ ...item, score: 0.5 }));
  }

  return items.map(item => ({
    ...item,
    score: (item.score - mean) / stdDev
  }));
}