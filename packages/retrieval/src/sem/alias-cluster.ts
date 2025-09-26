/**
 * Alias clustering using embeddings and distributional similarity
 */

import { CorpusStats } from '../stats/corpus-stats.js';

export interface AliasCluster {
  center: string;
  members: string[];
}

export interface EmbeddingFn {
  embed(text: string): Promise<number[]>;
}

// Cache for computed clusters
const clusterCache = new Map<string, { cluster: AliasCluster; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const EMBEDDING_SIMILARITY_THRESHOLD = parseFloat(process.env.ALIAS_EMB_SIM_TAU || '0.83');
const PMI_SIMILARITY_THRESHOLD = parseFloat(process.env.ALIAS_PMI_SIM_TAU || '0.30');

/**
 * Get alias cluster for a phrase using dual signal approach
 */
export async function getAliasCluster(
  phrase: string,
  stats: CorpusStats,
  embed: EmbeddingFn
): Promise<AliasCluster> {
  const cacheKey = phrase.toLowerCase();
  const cached = clusterCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.cluster;
  }

  const cluster = await buildAliasCluster(phrase, stats, embed);

  clusterCache.set(cacheKey, { cluster, timestamp: Date.now() });

  return cluster;
}

/**
 * Build alias cluster using embeddings and PMI similarity
 */
async function buildAliasCluster(
  phrase: string,
  stats: CorpusStats,
  embed: EmbeddingFn
): Promise<AliasCluster> {
  const normalizedPhrase = phrase.toLowerCase();
  const candidates = findCandidateAliases(normalizedPhrase, stats);

  if (candidates.length === 0) {
    return { center: phrase, members: [phrase] };
  }

  // Get embedding for center phrase
  let centerEmbedding: number[];
  try {
    centerEmbedding = await embed.embed(phrase);
  } catch (error) {
    console.warn(`Failed to embed phrase "${phrase}":`, error);
    return { center: phrase, members: [phrase] };
  }

  const members: string[] = [phrase];
  const processed = new Set<string>([normalizedPhrase]);

  for (const candidate of candidates) {
    if (processed.has(candidate.toLowerCase())) continue;

    const isSimilar = await checkSimilarity(
      phrase,
      candidate,
      centerEmbedding,
      stats,
      embed
    );

    if (isSimilar) {
      members.push(candidate);
      processed.add(candidate.toLowerCase());
    }
  }

  return {
    center: phrase,
    members: [...new Set(members)] // Remove any duplicates
  };
}

/**
 * Find candidate aliases from corpus statistics
 */
function findCandidateAliases(phrase: string, stats: CorpusStats): string[] {
  const candidates = new Set<string>();
  const words = phrase.split(/\s+/);

  // Direct co-occurring terms
  for (const word of words) {
    const coocs = stats.cooc.get(word.toLowerCase());
    if (coocs) {
      for (const [coocTerm, count] of coocs) {
        if (count > 2) { // Minimum co-occurrence threshold
          candidates.add(coocTerm);
        }
      }
    }
  }

  // Terms with high PMI to phrase words
  for (const word of words) {
    const pmis = stats.pmi.get(word.toLowerCase());
    if (pmis) {
      for (const [pmiTerm, score] of pmis) {
        if (score > PMI_SIMILARITY_THRESHOLD) {
          candidates.add(pmiTerm);
        }
      }
    }
  }

  return Array.from(candidates).filter(term =>
    term.length > 2 && // Not too short
    !words.includes(term) && // Not already in phrase
    stats.idf.get(term) && // Has IDF score
    stats.idf.get(term)! > 1.0 // Reasonably informative
  );
}

/**
 * Check if two phrases are similar using embedding and PMI signals
 */
async function checkSimilarity(
  phrase1: string,
  phrase2: string,
  embedding1: number[],
  stats: CorpusStats,
  embed: EmbeddingFn
): Promise<boolean> {
  // Embedding similarity
  let embeddingSim = 0;
  try {
    const embedding2 = await embed.embed(phrase2);
    embeddingSim = cosineSimilarity(embedding1, embedding2);
  } catch (error) {
    console.warn(`Failed to embed candidate "${phrase2}":`, error);
    return false;
  }

  // PMI-based distributional similarity
  const pmiSim = computePMISimilarity(phrase1, phrase2, stats);

  // Combined similarity score
  const combinedSim = 0.7 * embeddingSim + 0.3 * pmiSim;

  return combinedSim >= EMBEDDING_SIMILARITY_THRESHOLD;
}

/**
 * Compute PMI-based similarity between two phrases
 */
function computePMISimilarity(phrase1: string, phrase2: string, stats: CorpusStats): number {
  const words1 = phrase1.toLowerCase().split(/\s+/);
  const words2 = phrase2.toLowerCase().split(/\s+/);

  let totalPMI = 0;
  let pairCount = 0;

  // Cross-PMI between all word pairs
  for (const w1 of words1) {
    for (const w2 of words2) {
      const pmi1 = stats.pmi.get(w1)?.get(w2) || 0;
      const pmi2 = stats.pmi.get(w2)?.get(w1) || 0;
      const avgPMI = (pmi1 + pmi2) / 2;

      if (avgPMI > 0) {
        totalPMI += avgPMI;
        pairCount++;
      }
    }
  }

  return pairCount > 0 ? totalPMI / pairCount : 0;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (norm1 * norm2);
}

/**
 * Clear cluster cache (useful for testing or memory management)
 */
export function clearClusterCache(): void {
  clusterCache.clear();
}