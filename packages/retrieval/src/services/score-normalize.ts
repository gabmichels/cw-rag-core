export type NormalizationMethod = "zscore" | "minmax" | "none";

/**
 * Normalize scores using the specified method
 */
export function normalizeScores(
  scores: number[],
  method: NormalizationMethod
): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [0.5]; // Default for single item

  switch (method) {
    case "minmax":
      return minMaxNormalize(scores);
    case "zscore":
      return zScoreNormalize(scores);
    case "none":
    default:
      return scores;
  }
}

/**
 * Min-max normalization to [0,1] range
 */
export function minMaxNormalize(scores: number[]): number[] {
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;

  if (range === 0) {
    // All scores are the same, return 0.5 for all
    return scores.map(() => 0.5);
  }

  return scores.map(score => (score - minScore) / range);
}

/**
 * Z-score normalization (standardization)
 */
export function zScoreNormalize(scores: number[]): number[] {
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    // All scores are the same, return 0.5 for all
    return scores.map(() => 0.5);
  }

  return scores.map(score => (score - mean) / stdDev);
}

/**
 * Guards for edge cases in normalization
 */
export function hasConstantScores(scores: number[]): boolean {
  if (scores.length <= 1) return true;
  const firstScore = scores[0];
  return scores.every(score => score === firstScore);
}

export function hasSmallList(scores: number[], threshold: number = 2): boolean {
  return scores.length <= threshold;
}

/**
 * Safe normalization with fallbacks for edge cases
 */
export function safeNormalizeScores(
  scores: number[],
  method: NormalizationMethod,
  fallbackValue: number = 0.5
): number[] {
  if (scores.length === 0) return [];

  // Handle constant scores
  if (hasConstantScores(scores)) {
    return scores.map(() => fallbackValue);
  }

  // Handle small lists
  if (hasSmallList(scores)) {
    return scores.map(() => fallbackValue);
  }

  try {
    return normalizeScores(scores, method);
  } catch (error) {
    console.warn(`Normalization failed with method ${method}, falling back to ${fallbackValue}`);
    return scores.map(() => fallbackValue);
  }
}