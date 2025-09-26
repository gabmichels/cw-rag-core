import { encoding_for_model, type TiktokenModel } from 'tiktoken';

/**
 * Token budgeter using actual tokenizer instead of char heuristics
 */
export class TokenBudgeter {
  private encoder: ReturnType<typeof encoding_for_model>;

  constructor(
    private model: TiktokenModel = 'gpt-4o',
    private budgetTokens: number = 8000
  ) {
    this.encoder = encoding_for_model(model);
  }

  /**
   * Count actual tokens in text
   */
  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  /**
   * Check if text fits within budget
   */
  fitsBudget(text: string): boolean {
    return this.countTokens(text) <= this.budgetTokens;
  }

  /**
   * Estimate tokens without encoding (fast approximation)
   */
  estimateTokens(text: string): number {
    // Conservative estimate: ~4 chars per token for English
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Truncate text to fit budget
   */
  truncateToBudget(text: string, safetyMargin: number = 100): string {
    const availableTokens = this.budgetTokens - safetyMargin;
    const tokens = this.encoder.encode(text);

    if (tokens.length <= availableTokens) {
      return text;
    }

    const truncatedTokens = tokens.slice(0, availableTokens);
    const decoded = this.encoder.decode(truncatedTokens);
    return typeof decoded === 'string' ? decoded : new TextDecoder().decode(decoded);
  }

  /**
   * Update budget
   */
  setBudget(tokens: number): void {
    this.budgetTokens = tokens;
  }

  /**
   * Get current budget
   */
  getBudget(): number {
    return this.budgetTokens;
  }

  /**
   * Cleanup encoder
   */
  dispose(): void {
    this.encoder.free();
  }
}

/**
 * Factory for creating budgeter with config
 */
export function createTokenBudgeter(
  model: string = process.env.TOKENIZER_MODEL || 'gpt-4o',
  budget: number = parseInt(process.env.CONTEXT_TOKEN_BUDGET || '8000')
): TokenBudgeter {
  return new TokenBudgeter(model as TiktokenModel, budget);
}