import { HybridSearchResult } from '../types/hybrid.js';
import { TokenBudgeter, createTokenBudgeter } from './budgeter.js';
import { NoveltyScorer, createNoveltyScorer } from './novelty.js';
import { AnswerabilityScorer, createAnswerabilityScorer } from './answerability.js';

export interface PackingConfig {
  perDocCap: number;
  perSectionCap: number;
  noveltyAlpha: number;
  answerabilityBonus: number;
  sectionReunification: boolean;
  tokenBudget: number;
}

export interface PackedResult {
  chunks: HybridSearchResult[];
  totalTokens: number;
  truncated: boolean;
  trace: PackingTrace;
}

export interface PackingTrace {
  selectedIds: string[];
  tokenCounts: Record<string, number>;
  scores: Record<string, number>;
  capsApplied: {
    perDoc: Record<string, number>;
    perSection: Record<string, number>;
  };
  noveltyScores: Record<string, number>;
  droppedReasons: Record<string, string>;
  sectionReunions: Array<{
    chunkId: string;
    headerId?: string;
    neighborIds: string[];
  }>;
}

/**
 * Advanced context packing with token budgeting, caps, novelty, and answerability
 */
export class ContextPacker {
  constructor(
    private budgeter: TokenBudgeter,
    private noveltyScorer: NoveltyScorer,
    private answerabilityScorer: AnswerabilityScorer,
    private config: PackingConfig
  ) {}

  // Expose budgeter for token calculations
  getBudgeter(): TokenBudgeter {
    return this.budgeter;
  }

  /**
   * Pack chunks into context respecting all constraints
   */
  async pack(
    chunks: HybridSearchResult[],
    query?: string
  ): Promise<PackedResult> {
    const trace: PackingTrace = {
      selectedIds: [],
      tokenCounts: {},
      scores: {},
      capsApplied: { perDoc: {}, perSection: {} },
      noveltyScores: {},
      droppedReasons: {},
      sectionReunions: []
    };

    // Apply answerability scoring to all chunks first to boost direct answers
    const scoredChunks = await Promise.all(
      chunks.map(async (chunk) => {
        const baseScore = chunk.fusionScore || chunk.score || 0;
        const boostedScore = this.answerabilityScorer.applyBonus(chunk, baseScore, query);
        return { ...chunk, boostedScore };
      })
    );

    // Sort by boosted score (includes answerability bonus)
    const sortedChunks = [...scoredChunks].sort((a, b) =>
      (b.boostedScore || b.fusionScore || b.score || 0) - (a.boostedScore || a.fusionScore || a.score || 0)
    );

    const selected: HybridSearchResult[] = [];
    const docCounts: Record<string, number> = {};
    const sectionCounts: Record<string, number> = {};
    let totalTokens = 0;

    for (const chunk of sortedChunks) {
      const chunkId = chunk.id;
      const docId = chunk.payload?.docId || chunk.id;
      const sectionPath = chunk.payload?.sectionPath || 'default';

      // Check caps
      const docCount = docCounts[docId] || 0;
      const sectionCount = sectionCounts[sectionPath] || 0;

      if (docCount >= this.config.perDocCap) {
        trace.droppedReasons[chunkId] = `per-doc cap exceeded (${docCount}/${this.config.perDocCap})`;
        continue;
      }

      if (sectionCount >= this.config.perSectionCap) {
        trace.droppedReasons[chunkId] = `per-section cap exceeded (${sectionCount}/${this.config.perSectionCap})`;
        continue;
      }

      // Score novelty
      const novelty = await this.noveltyScorer.scoreNovelty(chunk, selected);
      trace.noveltyScores[chunkId] = novelty;

      // Apply answerability bonus (with query for direct answer detection)
      const baseScore = chunk.fusionScore || chunk.score || 0;
      const boostedScore = this.answerabilityScorer.applyBonus(chunk, baseScore, query);
      trace.scores[chunkId] = boostedScore;

      // Estimate tokens
      const content = chunk.content || '';
      const estimatedTokens = this.budgeter.estimateTokens(content);
      trace.tokenCounts[chunkId] = estimatedTokens;

      // Check if it fits in budget
      if (totalTokens + estimatedTokens > this.config.tokenBudget) {
        // Try section reunification if enabled
        if (this.config.sectionReunification) {
          const reunited = await this.trySectionReunion(chunk, selected, totalTokens, trace);
          if (reunited) continue; // Skip this chunk, reunion handled
        }

        trace.droppedReasons[chunkId] = `budget exceeded (${totalTokens + estimatedTokens}/${this.config.tokenBudget})`;
        continue;
      }

      // Select chunk
      selected.push(chunk);
      docCounts[docId] = docCount + 1;
      sectionCounts[sectionPath] = sectionCount + 1;
      totalTokens += estimatedTokens;
      trace.selectedIds.push(chunkId);
    }

    // Update caps in trace
    trace.capsApplied.perDoc = docCounts;
    trace.capsApplied.perSection = sectionCounts;

    // Final token count verification
    const actualTotalTokens = selected.reduce((sum, chunk) =>
      sum + this.budgeter.countTokens(chunk.content || ''), 0
    );

    return {
      chunks: selected,
      totalTokens: actualTotalTokens,
      truncated: actualTotalTokens >= this.config.tokenBudget,
      trace
    };
  }

  /**
   * Try to reunite chunk with section context
   */
  private async trySectionReunion(
    chunk: HybridSearchResult,
    selected: HybridSearchResult[],
    currentTokens: number,
    trace: PackingTrace
  ): Promise<boolean> {
    const sectionPath = chunk.payload?.sectionPath;
    if (!sectionPath) return false;

    // Find existing chunks from same section
    const sectionChunks = selected.filter(c => c.payload?.sectionPath === sectionPath);
    if (sectionChunks.length === 0) return false;

    // Check if we can add header/neighbors within budget
    const headerContent = chunk.payload?.header || '';
    const neighborContent = this.findNeighbors(chunk, selected).map(c => c.content || '').join(' ');

    const additionalTokens = this.budgeter.estimateTokens(headerContent + ' ' + neighborContent);

    if (currentTokens + additionalTokens <= this.config.tokenBudget) {
      // Add reunion info to trace
      trace.sectionReunions.push({
        chunkId: chunk.id,
        headerId: headerContent ? `${chunk.id}_header` : undefined,
        neighborIds: this.findNeighbors(chunk, selected).map(c => c.id)
      });
      return true;
    }

    return false;
  }

  /**
   * Find neighboring chunks in same section
   */
  private findNeighbors(chunk: HybridSearchResult, selected: HybridSearchResult[]): HybridSearchResult[] {
    const sectionPath = chunk.payload?.sectionPath;
    const orderIndex = chunk.payload?.orderIndex || 0;

    return selected
      .filter(c => c.payload?.sectionPath === sectionPath)
      .filter(c => Math.abs((c.payload?.orderIndex || 0) - orderIndex) <= 1)
      .slice(0, 2); // Max 2 neighbors
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PackingConfig>): void {
    this.config = { ...this.config, ...config };
    this.budgeter.setBudget(config.tokenBudget || this.config.tokenBudget);
    this.noveltyScorer.setAlpha(config.noveltyAlpha || this.config.noveltyAlpha);
    this.answerabilityScorer.setBonus(config.answerabilityBonus || this.config.answerabilityBonus);
  }
}

/**
 * Factory for context packer
 */
export function createContextPacker(
  embeddingService?: { embed(text: string): Promise<number[]> }
): ContextPacker {
  const config: PackingConfig = {
    perDocCap: parseInt(process.env.PACKING_PER_DOC_CAP || '2'),
    perSectionCap: parseInt(process.env.PACKING_PER_SECTION_CAP || '2'),
    noveltyAlpha: parseFloat(process.env.PACKING_NOVELTY_ALPHA || '0.5'),
    answerabilityBonus: parseFloat(process.env.PACKING_ANSWERABILITY_BONUS || '1.0'),
    sectionReunification: process.env.SECTION_REUNIFICATION === 'true',
    tokenBudget: parseInt(process.env.CONTEXT_TOKEN_BUDGET || '8000')
  };

  const budgeter = createTokenBudgeter();
  const noveltyScorer = createNoveltyScorer(config.noveltyAlpha, embeddingService);
  const answerabilityScorer = createAnswerabilityScorer(config.answerabilityBonus);

  return new ContextPacker(budgeter, noveltyScorer, answerabilityScorer, config);
}