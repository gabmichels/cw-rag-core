/**
 * Configuration manager for retrieval features
 */

export interface RetrievalFeatureFlags {
  // Core features
  adaptiveWeighting: boolean;
  mmrEnabled: boolean;
  deduplicationEnabled: boolean;
  ingestionGuardEnabled: boolean;

  // Chunking
  overlapEnabled: boolean;
  chunkValidationEnabled: boolean;

  // Context packing
  contextPackingEnabled: boolean;
  sectionReunificationEnabled: boolean;
  answerabilityGuardEnabled: boolean;

  // Performance
  cachingEnabled: boolean;
  adaptiveEfEnabled: boolean;

  // Thresholds
  minQualityScore: number;
  maxContextTokens: number;
  retrievalK: number;
}

export const DEFAULT_FEATURE_FLAGS: RetrievalFeatureFlags = {
  adaptiveWeighting: process.env.QUERY_ADAPTIVE_WEIGHTS === 'on',
  mmrEnabled: process.env.MMR_ENABLED === 'on',
  deduplicationEnabled: process.env.DEDUPLICATION_ENABLED !== 'off', // Default on
  ingestionGuardEnabled: process.env.INGESTION_GUARD_ENABLED !== 'off', // Default on

  overlapEnabled: process.env.CHUNK_OVERLAP_ENABLED !== 'off', // Default on
  chunkValidationEnabled: process.env.CHUNK_VALIDATION_ENABLED !== 'off', // Default on

  contextPackingEnabled: process.env.CONTEXT_PACKING_ENABLED !== 'off', // Default on
  sectionReunificationEnabled: process.env.SECTION_REUNIFICATION_ENABLED === 'on',
  answerabilityGuardEnabled: process.env.ANSWERABILITY_GUARD_ENABLED !== 'off', // Default on

  cachingEnabled: process.env.CACHING_ENABLED !== 'off', // Default on
  adaptiveEfEnabled: process.env.ADAPTIVE_EF_ENABLED !== 'off', // Default on

  minQualityScore: parseFloat(process.env.MIN_QUALITY_SCORE || '0.5'),
  maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS || '8000'),
  retrievalK: parseInt(process.env.RETRIEVAL_K_BASE || '12')
};

export class RetrievalConfigManager {
  private flags: RetrievalFeatureFlags;

  constructor(flags?: Partial<RetrievalFeatureFlags>) {
    this.flags = { ...DEFAULT_FEATURE_FLAGS, ...flags };
  }

  /**
   * Get current feature flags
   */
  getFlags(): RetrievalFeatureFlags {
    return { ...this.flags };
  }

  /**
   * Update feature flags
   */
  updateFlags(flags: Partial<RetrievalFeatureFlags>): void {
    this.flags = { ...this.flags, ...flags };
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(feature: keyof RetrievalFeatureFlags): boolean {
    const value = this.flags[feature];
    return typeof value === 'boolean' ? value : false;
  }

  /**
   * Get numeric config value
   */
  getNumber(key: keyof RetrievalFeatureFlags): number {
    const value = this.flags[key];
    return typeof value === 'number' ? value : 0;
  }

  /**
   * Export configuration for telemetry
   */
  exportForTelemetry(): Record<string, any> {
    return {
      features: Object.entries(this.flags).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, any>),
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.flags.minQualityScore < 0 || this.flags.minQualityScore > 1) {
      errors.push('minQualityScore must be between 0 and 1');
    }

    if (this.flags.maxContextTokens < 1000) {
      errors.push('maxContextTokens must be at least 1000');
    }

    if (this.flags.retrievalK < 1) {
      errors.push('retrievalK must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Global instance
export const configManager = new RetrievalConfigManager();