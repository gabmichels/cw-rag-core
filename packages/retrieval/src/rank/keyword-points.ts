export interface KeywordPointsConfig {
  fieldWeights: { body: number; title: number; header: number; sectionPath: number; docId: number; };
  idfGamma: number;          // γ
  rankDecay: number;         // δ
  bodySatC: number;          // C
  earlyPosTokens: number;    // N
  earlyPosNudge: number;     // multiplier
  proxWin: number;           // PROX_WIN
  proximityBeta: number;     // β
  coverageAlpha: number;     // α
  exclusivityGamma: number;  // γ (penalty)
  lambdaKw: number;          // λ
  clampKwNorm?: number;      // default 2.0
  topKCoverage?: number;     // default 2 or 3
  softAndStrict?: boolean;
  softAndOverridePct?: number; // 95
}

export interface TermHit {
  field: "body"|"title"|"header"|"sectionPath"|"docId";
  match: "exact"|"lemma"|"fuzzy";
  positions?: number[]; // token positions if available
}

export interface CandidateSignals {
  id: string;
  docId?: string;
  sectionPath?: string;
  title?: string;
  header?: string;
  body?: string;
  tokenPositions?: Record<string, number[]>; // term -> positions in body
  termHits: Record<string, TermHit[]>; // filled by keyword-search.ts
  fusedScore: number;
}

export interface TermWeight { term: string; weight: number; rank: number; }

export function computeKeywordPoints(
  terms: TermWeight[],
  candidates: CandidateSignals[],
  cfg: KeywordPointsConfig,
  exclusivityFn?: (candTerms: string[], topTerms: string[], stats?: any) => number // returns penalty in [0,1]
): { id: string; rawKw: number; kwNorm: number; finalAfterKw: number; breakdown: any }[] {

  if (terms.length === 0) {
    return candidates.map(c => ({
      id: c.id,
      rawKw: 0,
      kwNorm: 0,
      finalAfterKw: c.fusedScore,
      breakdown: { terms: [], proximity_bonus: 1, coverage_bonus: 1, exclusivity_multiplier: 1 }
    }));
  }

  // Compute per-candidate keyword points
  const results = candidates.map(candidate => {
    let rawKw = 0;
    const perTermBreakdown: any[] = [];

    // Process each term
    for (const term of terms) {
      const termHits = candidate.termHits[term.term] || [];
      const bodyHits = termHits.filter(h => h.field === 'body').length;

      // Body saturation
      const sat = 1 - Math.exp(-cfg.bodySatC * bodyHits);

      // Find best field match
      let bestField: keyof typeof cfg.fieldWeights = 'body';
      let bestMatchStrength = 0;
      let bestPositions: number[] | undefined;

      for (const hit of termHits) {
        let matchStrength = 0;
        if (hit.match === 'exact') matchStrength = 1.0;
        else if (hit.match === 'lemma') matchStrength = 0.7;
        else if (hit.match === 'fuzzy') matchStrength = 0.4;

        if (matchStrength > bestMatchStrength) {
          bestMatchStrength = matchStrength;
          bestField = hit.field;
          bestPositions = hit.positions;
        }
      }

      // Position nudge for early body mentions
      let positionNudge = 1.0;
      if (bestField === 'body' && bestPositions && bestPositions.length > 0) {
        const firstPos = Math.min(...bestPositions);
        if (firstPos <= cfg.earlyPosTokens) {
          positionNudge = cfg.earlyPosNudge;
        }
      }

      // Rank decay
      const rankDecay = Math.pow(cfg.rankDecay, term.rank - 1);

      // Term points
      const fieldWeight = cfg.fieldWeights[bestField];
      const termPoints = term.weight * rankDecay * fieldWeight * bestMatchStrength * sat * positionNudge;

      rawKw += termPoints;

      perTermBreakdown.push({
        term: term.term,
        rank: term.rank,
        weight: term.weight,
        rankDecay,
        bestField,
        match: bestMatchStrength > 0 ? 'exact' : 'none',
        bodyHits,
        sat,
        positionNudge,
        points: termPoints
      });
    }

    return {
      candidate,
      rawKw,
      perTermBreakdown
    };
  });

  // Compute proximity bonus (cross-term)
  let proximityBonus = 1.0;
  if (terms.length >= 2 && cfg.proximityBeta > 0) {
    const topTerms = terms.slice(0, 3); // Use top 2-3 terms
    const positionsByTerm: Record<string, number[]> = {};

    // Collect positions for top terms in body
    for (const candidate of candidates) {
      if (!candidate.tokenPositions) continue;

      for (const term of topTerms) {
        const positions = candidate.tokenPositions[term.term];
        if (positions && positions.length > 0) {
          positionsByTerm[term.term] = positions;
        }
      }

      if (Object.keys(positionsByTerm).length >= 2) {
        // Find min span covering all top terms
        const allPositions = Object.values(positionsByTerm).flat().sort((a, b) => a - b);
        if (allPositions.length >= Object.keys(positionsByTerm).length) {
          const span = allPositions[allPositions.length - 1] - allPositions[0];
          const bonus = 1 + cfg.proximityBeta * Math.max(0, 1 - span / cfg.proxWin);
          proximityBonus = Math.max(proximityBonus, bonus);
        }
      }
    }
  }

  // Coverage bonus
  const topK = cfg.topKCoverage || 2;
  const coverageBonus = terms.length >= topK ? (1 + cfg.coverageAlpha) : 1.0;

  // Exclusivity penalty
  let exclusivityMultiplier = 1.0;
  if (exclusivityFn && cfg.exclusivityGamma > 0) {
    const topTerms = terms.slice(0, topK).map(t => t.term);
    for (const result of results) {
      const candTerms = Object.keys(result.candidate.termHits);
      const penalty = exclusivityFn(candTerms, topTerms); // Note: stats parameter omitted for now
      exclusivityMultiplier = Math.min(exclusivityMultiplier, 1 - cfg.exclusivityGamma * penalty);
    }
  }

  // Apply bonuses/penalties to rawKw
  for (const result of results) {
    result.rawKw *= proximityBonus * coverageBonus * exclusivityMultiplier;
  }

  // Normalize per query
  const rawKws = results.map(r => r.rawKw);
  const medianRawKw = rawKws.length > 0 ? rawKws.sort((a, b) => a - b)[Math.floor(rawKws.length / 2)] : 0;
  const epsilon = 1e-6;

  const finalResults = results.map(result => {
    const kwNorm = medianRawKw > 0 ? result.rawKw / (medianRawKw + epsilon) : 0;
    const clampedKwNorm = cfg.clampKwNorm ? Math.min(kwNorm, cfg.clampKwNorm) : kwNorm;
    const finalAfterKw = result.candidate.fusedScore + cfg.lambdaKw * clampedKwNorm;

    return {
      id: result.candidate.id,
      rawKw: result.rawKw,
      kwNorm: clampedKwNorm,
      finalAfterKw,
      breakdown: {
        perTerm: result.perTermBreakdown,
        proximity_bonus: proximityBonus,
        coverage_bonus: coverageBonus,
        exclusivity_multiplier: exclusivityMultiplier,
        median_raw_kw: medianRawKw,
        lambda: cfg.lambdaKw
      }
    };
  });

  return finalResults;
}