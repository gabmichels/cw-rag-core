/**
 * Exclusivity penalty computation based on co-occurrence graph
 */

import { CorpusStats } from '../stats/corpus-stats.js';

const EXCLUSIVITY_THRESHOLD = 0.1; // Minimum PMI difference for exclusivity
const HIGH_IDF_THRESHOLD = 2.0; // Terms with IDF above this are considered high-IDF

/**
 * Compute exclusivity penalty for a candidate document
 */
export function exclusivityPenalty(
  candidateTerms: string[],
  groups: string[][],
  stats: CorpusStats
): number {
  if (groups.length < 2) return 0.0; // No exclusivity possible with < 2 groups

  const candidateTermSet = new Set(candidateTerms.map(t => t.toLowerCase()));
  let totalPenalty = 0.0;
  let penaltyCount = 0;

  // Check each pair of groups for exclusivity
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const group1 = groups[i];
      const group2 = groups[j];

      const penalty = computePairExclusivity(
        group1,
        group2,
        candidateTermSet,
        stats
      );

      if (penalty > 0) {
        totalPenalty += penalty;
        penaltyCount++;
      }
    }
  }

  return penaltyCount > 0 ? totalPenalty / penaltyCount : 0.0;
}

/**
 * Compute exclusivity penalty for a pair of groups
 */
function computePairExclusivity(
  group1: string[],
  group2: string[],
  candidateTerms: Set<string>,
  stats: CorpusStats
): number {
  // Check if candidate has terms from group1 but not group2
  const hasGroup1 = group1.some(term => candidateTerms.has(term.toLowerCase()));
  const hasGroup2 = group2.some(term => candidateTerms.has(term.toLowerCase()));

  if (!hasGroup1 || hasGroup2) {
    return 0.0; // No penalty if both groups present or neither
  }

  // Find exclusive terms (high-IDF terms that rarely co-occur with the other group)
  const exclusiveTerms = findExclusiveTerms(group1, group2, stats);

  if (exclusiveTerms.length === 0) {
    return 0.0;
  }

  // Check if candidate contains any exclusive terms
  const hasExclusiveTerm = exclusiveTerms.some(term =>
    candidateTerms.has(term.toLowerCase())
  );

  return hasExclusiveTerm ? 1.0 : 0.0;
}

/**
 * Find terms that are exclusive between two groups
 */
function findExclusiveTerms(
  group1: string[],
  group2: string[],
  stats: CorpusStats
): string[] {
  const exclusiveTerms: string[] = [];

  // Check terms in group1 that are exclusive to group1 vs group2
  for (const term1 of group1) {
    const term1Lower = term1.toLowerCase();
    const idf1 = stats.idf.get(term1Lower);

    if (!idf1 || idf1 < HIGH_IDF_THRESHOLD) continue; // Skip low-IDF terms

    let isExclusive = true;
    let maxPMIWithGroup2 = 0;

    // Check PMI with terms in group2
    for (const term2 of group2) {
      const term2Lower = term2.toLowerCase();
      const pmi = stats.pmi.get(term1Lower)?.get(term2Lower) || 0;
      maxPMIWithGroup2 = Math.max(maxPMIWithGroup2, pmi);

      // If there's significant co-occurrence, not exclusive
      if (pmi > EXCLUSIVITY_THRESHOLD) {
        isExclusive = false;
        break;
      }
    }

    // Also check reverse: terms in group2 that co-occur with term1
    if (isExclusive) {
      for (const term2 of group2) {
        const term2Lower = term2.toLowerCase();
        const pmi = stats.pmi.get(term2Lower)?.get(term1Lower) || 0;

        if (pmi > EXCLUSIVITY_THRESHOLD) {
          isExclusive = false;
          break;
        }
      }
    }

    // Check co-occurrence counts
    if (isExclusive) {
      const coocWithGroup2 = group2.reduce((sum, term2) => {
        const term2Lower = term2.toLowerCase();
        return sum + (stats.cooc.get(term1Lower)?.get(term2Lower) || 0);
      }, 0);

      // If co-occurs more than threshold, not exclusive
      if (coocWithGroup2 > 2) {
        isExclusive = false;
      }
    }

    if (isExclusive) {
      exclusiveTerms.push(term1);
    }
  }

  return exclusiveTerms;
}

/**
 * Compute normalized PMI between two terms
 */
function normalizedPMI(term1: string, term2: string, stats: CorpusStats): number {
  const pmi1 = stats.pmi.get(term1.toLowerCase())?.get(term2.toLowerCase()) || 0;
  const pmi2 = stats.pmi.get(term2.toLowerCase())?.get(term1.toLowerCase()) || 0;

  return (pmi1 + pmi2) / 2;
}

/**
 * Compute Jaccard similarity between document sets of two terms
 */
function documentJaccard(term1: string, term2: string, stats: CorpusStats): number {
  // This is a simplified version - in practice you'd need document-term matrices
  // For now, use co-occurrence as proxy
  const cooc1 = stats.cooc.get(term1.toLowerCase())?.size || 0;
  const cooc2 = stats.cooc.get(term2.toLowerCase())?.size || 0;

  if (cooc1 === 0 && cooc2 === 0) return 1.0;

  // Intersection approximated by co-occurrence count
  const intersection = stats.cooc.get(term1.toLowerCase())?.get(term2.toLowerCase()) || 0;

  return intersection / (cooc1 + cooc2 - intersection);
}