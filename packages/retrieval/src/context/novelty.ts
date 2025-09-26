import { HybridSearchResult } from '../types/hybrid.js';

/**
 * Novelty scorer using cosine similarity for MMR/deduplication
 */
export class NoveltyScorer {
  constructor(
    private alpha: number = 0.5, // MMR diversity weight
    private embeddingService?: { embed(text: string): Promise<number[]> }
  ) {}

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Score novelty of candidate against selected set
   */
  async scoreNovelty(
    candidate: HybridSearchResult,
    selected: HybridSearchResult[]
  ): Promise<number> {
    if (selected.length === 0) return 1.0; // Maximum novelty if nothing selected

    if (!this.embeddingService) {
      // Fallback: text-based similarity
      return this.textBasedNovelty(candidate, selected);
    }

    // Use embeddings for better similarity
    const candidateEmbedding = await this.embeddingService.embed(candidate.content || '');
    let maxSimilarity = 0;

    for (const selectedItem of selected) {
      const selectedEmbedding = await this.embeddingService.embed(selectedItem.content || '');
      const similarity = this.cosineSimilarity(candidateEmbedding, selectedEmbedding);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return 1 - maxSimilarity; // Convert similarity to novelty
  }

  /**
   * Fallback text-based novelty using Jaccard similarity
   */
  private textBasedNovelty(candidate: HybridSearchResult, selected: HybridSearchResult[]): number {
    const candidateWords = new Set(
      (candidate.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    let maxSimilarity = 0;

    for (const selectedItem of selected) {
      const selectedWords = new Set(
        (selectedItem.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
      );

      const intersection = new Set([...candidateWords].filter(x => selectedWords.has(x)));
      const union = new Set([...candidateWords, ...selectedWords]);

      const jaccard = intersection.size / union.size;
      maxSimilarity = Math.max(maxSimilarity, jaccard);
    }

    return 1 - maxSimilarity;
  }

  /**
   * MMR score: balance relevance and novelty
   */
  async mmrScore(
    candidate: HybridSearchResult,
    selected: HybridSearchResult[],
    relevanceScore: number
  ): Promise<number> {
    const novelty = await this.scoreNovelty(candidate, selected);
    return this.alpha * relevanceScore - (1 - this.alpha) * (1 - novelty);
  }

  /**
   * Apply MMR to ranked candidates
   */
  async applyMMR(
    candidates: HybridSearchResult[],
    maxResults: number,
    relevanceKey: keyof HybridSearchResult = 'fusionScore'
  ): Promise<HybridSearchResult[]> {
    const selected: HybridSearchResult[] = [];
    const remaining = [...candidates];

    while (selected.length < maxResults && remaining.length > 0) {
      let bestCandidate: HybridSearchResult | null = null;
      let bestScore = -Infinity;

      for (const candidate of remaining) {
        const relevance = (candidate[relevanceKey] as number) || 0;
        const mmrScore = await this.mmrScore(candidate, selected, relevance);

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        selected.push(bestCandidate);
        const index = remaining.indexOf(bestCandidate);
        remaining.splice(index, 1);
      } else {
        break; // No more candidates with positive MMR score
      }
    }

    return selected;
  }

  /**
   * Update alpha parameter
   */
  setAlpha(alpha: number): void {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }
}

/**
 * Factory for novelty scorer
 */
export function createNoveltyScorer(
  alpha: number = parseFloat(process.env.PACKING_NOVELTY_ALPHA || '0.5'),
  embeddingService?: { embed(text: string): Promise<number[]> }
): NoveltyScorer {
  return new NoveltyScorer(alpha, embeddingService);
}