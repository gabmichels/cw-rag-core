/**
 * Query intent detection for adaptive retrieval weighting
 */

import { FusionStrategyName } from '../services/fusion.js';

export enum QueryIntent {
  DEFINITION_MEASUREMENT_PROCEDURE = 'definition_measurement_procedure',
  ENTITY_LOOKUP = 'entity_lookup',
  EXPLORATORY = 'exploratory'
}

export interface IntentConfig {
  vectorWeight: number;
  keywordWeight: number;
  retrievalK: number;
  strategy: FusionStrategyName;
  kParam?: number;
}

/**
 * Detects query intent to adapt retrieval strategy
 */
export class QueryIntentDetector {
  private static readonly INTENT_CONFIGS: Record<QueryIntent, IntentConfig> = {
    [QueryIntent.DEFINITION_MEASUREMENT_PROCEDURE]: {
      vectorWeight: 0.3,
      keywordWeight: 0.7,
      retrievalK: 20,
      strategy: "weighted_average"
    },
    [QueryIntent.ENTITY_LOOKUP]: {
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      retrievalK: 12,
      strategy: "weighted_average"
    },
    [QueryIntent.EXPLORATORY]: {
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      retrievalK: 12,
      strategy: "weighted_average"
    }
  };

  /**
   * Detect intent from query text
   */
  detectIntent(query: string): QueryIntent {
    const lowerQuery = query.toLowerCase();

    // Definition/measurement/procedure patterns
    const definitionPatterns = [
      /\b(what is|what does|what are|how does|explain|define)\b/i,
      /\b(how long|how much|how many|how tall|how wide|how deep)\b/i,
      /\b(what's the|whats the)\b/i,
      /\b(calculate|compute|measure|steps to|procedure for)\b/i,
      /\b(algorithm|method|process|technique)\b/i
    ];

    // Entity lookup patterns (specific named entities)
    const entityPatterns = [
      /\b(who|what|where) (is|was|are|were)\b/i,
      /\b(tell me about|information on|details about)\b/i,
      /\b(history of|origin of|background on)\b/i
    ];

    // Check for definition/measurement/procedure intent
    if (definitionPatterns.some(pattern => pattern.test(lowerQuery))) {
      return QueryIntent.DEFINITION_MEASUREMENT_PROCEDURE;
    }

    // Check for entity lookup intent
    if (entityPatterns.some(pattern => pattern.test(lowerQuery))) {
      return QueryIntent.ENTITY_LOOKUP;
    }

    // Default to exploratory
    return QueryIntent.EXPLORATORY;
  }

  /**
   * Get configuration for detected intent
   */
  getIntentConfig(intent: QueryIntent): IntentConfig {
    return QueryIntentDetector.INTENT_CONFIGS[intent];
  }

  /**
   * Get configuration for query with high-confidence shortcut
   */
  getConfigForQuery(query: string, topVectorScore?: number): IntentConfig {
    const intent = this.detectIntent(query);
    const baseConfig = this.getIntentConfig(intent);

    // High-confidence shortcut: if top vector normalized ≥ 0.70 and intent ∈ {definition, measurement, exact-lookup},
    // temporarily set strategy "max_confidence" for top-K=3 fusion
    if (topVectorScore !== undefined &&
        topVectorScore >= 0.70 &&
        (intent === QueryIntent.DEFINITION_MEASUREMENT_PROCEDURE ||
         intent === QueryIntent.ENTITY_LOOKUP)) {
      return {
        ...baseConfig,
        strategy: "max_confidence"
      };
    }

    return baseConfig;
  }
}

/**
 * Factory for intent detector
 */
export function createQueryIntentDetector(): QueryIntentDetector {
  return new QueryIntentDetector();
}