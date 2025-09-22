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
    userContext: string;
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
export declare const ANSWERABILITY_THRESHOLDS: Record<string, AnswerabilityThreshold>;
export declare const DEFAULT_IDK_TEMPLATES: IdkResponseTemplate[];
export declare const DEFAULT_GUARDRAIL_CONFIG: TenantGuardrailConfig;
