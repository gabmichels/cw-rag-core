/**
 * Corpus-level statistics for domainless ranking
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CorpusStats {
  idf: Map<string, number>;
  cooc: Map<string, Map<string, number>>;
  pmi: Map<string, Map<string, number>>;
  totalDocs: number;
  totalTokens: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let cachedStats: Map<string, CorpusStats> = new Map();
let cacheTimestamps: Map<string, number> = new Map();

/**
 * Load corpus statistics from disk cache or compute if needed
 */
export function loadCorpusStats(tenant: string): CorpusStats {
  const now = Date.now();
  const cacheKey = tenant;

  // Return cached stats if still valid
  const cacheTimestamp = cacheTimestamps.get(cacheKey) || 0;
  if (cachedStats.has(cacheKey) && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedStats.get(cacheKey)!;
  }

  const STATS_FILE = path.join(process.cwd(), 'data', `corpus-stats-${tenant}.json`);

  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      const stats = deserializeCorpusStats(data);
      cachedStats.set(cacheKey, stats);
      cacheTimestamps.set(cacheKey, now);
      return stats;
    }
  } catch (error) {
    console.warn(`Failed to load corpus stats for tenant ${tenant} from disk:`, error);
  }

  // Return empty stats if no cached data
  const emptyStats: CorpusStats = {
    idf: new Map(),
    cooc: new Map(),
    pmi: new Map(),
    totalDocs: 0,
    totalTokens: 0
  };
  cachedStats.set(cacheKey, emptyStats);
  cacheTimestamps.set(cacheKey, now);

  return emptyStats;
}

/**
 * Save corpus statistics to disk
 */
export function saveCorpusStats(stats: CorpusStats, tenant: string): void {
  try {
    const STATS_FILE = path.join(process.cwd(), 'data', `corpus-stats-${tenant}.json`);
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = serializeCorpusStats(stats);
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    cachedStats.set(tenant, stats);
    cacheTimestamps.set(tenant, Date.now());
  } catch (error) {
    console.error(`Failed to save corpus stats for tenant ${tenant}:`, error);
  }
}

/**
 * Update corpus statistics with new documents
 */
export function updateCorpusStats(documents: Array<{content: string, id: string}>, tenant: string): CorpusStats {
  const currentStats = loadCorpusStats(tenant);

  // Document frequency maps
  const docFreq = new Map<string, number>();
  const termDocCount = new Map<string, number>();

  // Co-occurrence within sliding window
  const coocWindow = new Map<string, Map<string, number>>();
  const windowSize = 50;

  let totalTokens = currentStats.totalTokens;
  let totalDocs = currentStats.totalDocs;

  for (const doc of documents) {
    const tokens = tokenizeAndNormalize(doc.content);
    totalTokens += tokens.length;
    totalDocs += 1;

    // Track document frequency
    const seenInDoc = new Set<string>();
    for (const token of tokens) {
      if (!seenInDoc.has(token)) {
        seenInDoc.add(token);
        termDocCount.set(token, (termDocCount.get(token) || 0) + 1);
      }
    }

    // Track co-occurrence within window
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < Math.min(i + windowSize, tokens.length); j++) {
        const t1 = tokens[i];
        const t2 = tokens[j];

        if (!coocWindow.has(t1)) coocWindow.set(t1, new Map());
        const t1Cooc = coocWindow.get(t1)!;
        t1Cooc.set(t2, (t1Cooc.get(t2) || 0) + 1);

        if (!coocWindow.has(t2)) coocWindow.set(t2, new Map());
        const t2Cooc = coocWindow.get(t2)!;
        t2Cooc.set(t1, (t2Cooc.get(t1) || 0) + 1);
      }
    }
  }

  // Merge with existing stats
  for (const [term, count] of termDocCount) {
    docFreq.set(term, (currentStats.idf.get(term) || 0) * currentStats.totalDocs + count);
  }

  // Merge co-occurrence
  for (const [t1, coocs] of coocWindow) {
    if (!currentStats.cooc.has(t1)) currentStats.cooc.set(t1, new Map());
    const existingCooc = currentStats.cooc.get(t1)!;

    for (const [t2, count] of coocs) {
      existingCooc.set(t2, (existingCooc.get(t2) || 0) + count);
    }
  }

  // Compute IDF
  const newIdf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    newIdf.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1); // Smoothed IDF
  }

  // Compute PMI
  const newPmi = new Map<string, Map<string, number>>();
  for (const [t1, coocs] of currentStats.cooc) {
    const t1Pmi = new Map<string, number>();
    const t1Freq = docFreq.get(t1) || 1;

    for (const [t2, coocCount] of coocs) {
      const t2Freq = docFreq.get(t2) || 1;
      const pmi = Math.log((coocCount * totalTokens) / (t1Freq * t2Freq));
      t1Pmi.set(t2, Math.max(0, pmi)); // Clamp to non-negative
    }

    newPmi.set(t1, t1Pmi);
  }

  const updatedStats: CorpusStats = {
    idf: newIdf,
    cooc: currentStats.cooc,
    pmi: newPmi,
    totalDocs,
    totalTokens
  };

  // Save to disk
  saveCorpusStats(updatedStats, tenant);

  return updatedStats;
}

/**
 * Tokenize and normalize text
 */
function tokenizeAndNormalize(text: string): string[] {
  return text.toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/[^\w]/g, ''))
    .filter(token => token.length > 2 && !isStopword(token));
}

/**
 * Simple stopword check
 */
function isStopword(word: string): boolean {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'my',
    'your', 'his', 'her', 'our', 'their'
  ]);
  return stopwords.has(word);
}

/**
 * Serialize corpus stats for JSON storage
 */
function serializeCorpusStats(stats: CorpusStats): any {
  return {
    idf: Object.fromEntries(stats.idf),
    cooc: Object.fromEntries(
      Array.from(stats.cooc.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
    ),
    pmi: Object.fromEntries(
      Array.from(stats.pmi.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
    ),
    totalDocs: stats.totalDocs,
    totalTokens: stats.totalTokens
  };
}

/**
 * Deserialize corpus stats from JSON
 */
function deserializeCorpusStats(data: any): CorpusStats {
  return {
    idf: new Map(Object.entries(data.idf || {})),
    cooc: new Map(
      Object.entries(data.cooc || {}).map(([k, v]: [string, any]) =>
        [k, new Map(Object.entries(v))]
      )
    ),
    pmi: new Map(
      Object.entries(data.pmi || {}).map(([k, v]: [string, any]) =>
        [k, new Map(Object.entries(v))]
      )
    ),
    totalDocs: data.totalDocs || 0,
    totalTokens: data.totalTokens || 0
  };
}