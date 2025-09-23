export interface AnswerabilityScore {
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Statistical analysis of retrieval scores */
  scoreStats: ScoreStatistics;
  /** Individual scoring algorithm results */
  algorithmScores: AlgorithmScores;
  /** Decision whether query is answerable */
  isAnswerable: boolean;
  /** Reasoning for the decision */
  reasoning: string;
  /** Computation time in milliseconds */
  computationTime: number;
  /** Source-aware confidence tracking result */
  sourceAwareConfidence?: any; // Will be typed properly when imported
}

export interface ScoreStatistics {
  /** Mean of all retrieval scores */
  mean: number;
  /** Maximum retrieval score */
  max: number;
  /** Minimum retrieval score */
  min: number;
  /** Standard deviation of scores */
  stdDev: number;
  /** Number of results analyzed */
  count: number;
  /** Score distribution metrics */
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

export interface AlgorithmScores {
  /** Statistical threshold-based scoring */
  statistical: number;
  /** Simple threshold-based scoring */
  threshold: number;
  /** ML-ready feature scoring */
  mlFeatures: number;
  /** Reranker confidence scoring */
  rerankerConfidence?: number;
}

export interface AnswerabilityThreshold {
  /** Threshold type identifier */
  type: 'strict' | 'moderate' | 'permissive' | 'custom';
  /** Minimum confidence score required */
  minConfidence: number;
  /** Minimum top result score required */
  minTopScore: number;
  /** Minimum mean score required */
  minMeanScore: number;
  /** Maximum allowed standard deviation */
  maxStdDev: number;
  /** Minimum number of results required */
  minResultCount: number;
}

export interface TenantGuardrailConfig {
  /** Tenant identifier */
  tenantId: string;
  /** Whether guardrail is enabled */
  enabled: boolean;
  /** Answerability threshold configuration */
  threshold: AnswerabilityThreshold;
  /** Custom IDK response templates */
  idkTemplates?: IdkResponseTemplate[];
  /** Fallback suggestion configuration */
  fallbackConfig?: FallbackConfig;
  /** Bypass mode for admin/testing */
  bypassEnabled: boolean;
  /** Algorithm weights for ensemble scoring */
  algorithmWeights: {
    statistical: number;
    threshold: number;
    mlFeatures: number;
    rerankerConfidence: number;
  };
}

export interface IdkResponseTemplate {
  /** Template identifier */
  id: string;
  /** Reason code for IDK response */
  reasonCode: string;
  /** Response message template */
  template: string;
  /** Whether to include suggestions */
  includeSuggestions: boolean;
}

export interface FallbackConfig {
  /** Whether to provide fallback suggestions */
  enabled: boolean;
  /** Maximum number of suggestions */
  maxSuggestions: number;
  /** Minimum score threshold for suggestions */
  suggestionThreshold: number;
}

export interface GuardrailDecision {
  /** Whether the query is answerable */
  isAnswerable: boolean;
  /** Answerability score details */
  score: AnswerabilityScore;
  /** Applied threshold configuration */
  threshold: AnswerabilityThreshold;
  /** IDK response if not answerable */
  idkResponse?: IdkResponse;
  /** Audit trail for the decision */
  auditTrail: GuardrailAuditTrail;
}

export interface IdkResponse {
  /** Response message */
  message: string;
  /** Reason code */
  reasonCode: string;
  /** Suggested alternatives or clarifications */
  suggestions?: string[];
  /** Confidence level that led to IDK */
  confidenceLevel: number;
}

export interface GuardrailAuditTrail {
  /** Timestamp of decision */
  timestamp: string;
  /** Query that was evaluated */
  query: string;
  /** Tenant ID */
  tenantId: string;
  /** User context */
  userContext: string; // Serialized UserContext
  /** Retrieval results count */
  retrievalResultsCount: number;
  /** Score statistics summary */
  scoreStatsSummary: string;
  /** Decision rationale */
  decisionRationale: string;
  /** Performance metrics */
  performanceMetrics: {
    scoringDuration: number;
    totalDuration: number;
  };
}

// Predefined threshold configurations
export const ANSWERABILITY_THRESHOLDS: Record<string, AnswerabilityThreshold> = {
  strict: {
    type: 'strict',
    minConfidence: 0.8,
    minTopScore: 0.7,
    minMeanScore: 0.5,
    maxStdDev: 0.3,
    minResultCount: 3
  },
  moderate: {
    type: 'moderate',
    minConfidence: 0.6,
    minTopScore: 0.5,
    minMeanScore: 0.3,
    maxStdDev: 0.4,
    minResultCount: 2
  },
  permissive: {
    type: 'permissive',
    minConfidence: 0.4,
    minTopScore: 0.3,
    minMeanScore: 0.2,
    maxStdDev: 0.5,
    minResultCount: 1
  }
};

// Default IDK response templates
export const DEFAULT_IDK_TEMPLATES: IdkResponseTemplate[] = [
  {
    id: 'insufficient_confidence',
    reasonCode: 'LOW_CONFIDENCE',
    template: "I don't have enough confidence in the available information to provide a reliable answer to your question.",
    includeSuggestions: true
  },
  {
    id: 'no_relevant_results',
    reasonCode: 'NO_RELEVANT_DOCS',
    template: "I couldn't find relevant information in the knowledge base to answer your question.",
    includeSuggestions: true
  },
  {
    id: 'ambiguous_query',
    reasonCode: 'AMBIGUOUS_QUERY',
    template: "Your question is ambiguous or too broad. Could you please provide more specific details?",
    includeSuggestions: false
  },
  {
    id: 'outside_domain',
    reasonCode: 'OUTSIDE_DOMAIN',
    template: "This question appears to be outside the scope of the available knowledge base.",
    includeSuggestions: false
  }
];

// Create environment-aware threshold configuration
function createEnvironmentAwareThreshold(): AnswerabilityThreshold {
  const envThreshold = parseFloat(process.env.ANSWERABILITY_THRESHOLD || '0.6');

  // If environment variable is set to a very low value (like 0.01), create a permissive threshold
  if (envThreshold <= 0.1) {
    return {
      type: 'custom',
      minConfidence: envThreshold,
      minTopScore: 0.01,       // Match actual search quality (1.55%)
      minMeanScore: 0.01,      // Match actual search quality (1.25%)
      maxStdDev: 1.0,          // Allow high variance
      minResultCount: 1        // Only need 1 result
    };
  }

  // For higher values, scale proportionally from permissive threshold
  const baseThreshold = ANSWERABILITY_THRESHOLDS.permissive;
  const scaleFactor = envThreshold / 0.4; // 0.4 is permissive minConfidence

  return {
    type: 'custom',
    minConfidence: envThreshold,
    minTopScore: Math.min(baseThreshold.minTopScore * scaleFactor, 1.0),
    minMeanScore: Math.min(baseThreshold.minMeanScore * scaleFactor, 1.0),
    maxStdDev: baseThreshold.maxStdDev,
    minResultCount: baseThreshold.minResultCount
  };
}

// Default tenant guardrail configuration
export const DEFAULT_GUARDRAIL_CONFIG: TenantGuardrailConfig = {
  tenantId: 'default',
  enabled: true,
  threshold: createEnvironmentAwareThreshold(),
  idkTemplates: DEFAULT_IDK_TEMPLATES,
  fallbackConfig: {
    enabled: true,
    maxSuggestions: 3,
    suggestionThreshold: 0.3
  },
  bypassEnabled: false,
  algorithmWeights: {
    statistical: 0.4,
    threshold: 0.3,
    mlFeatures: 0.2,
    rerankerConfidence: 0.1
  }
};