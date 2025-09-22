// Predefined threshold configurations
export const ANSWERABILITY_THRESHOLDS = {
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
export const DEFAULT_IDK_TEMPLATES = [
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
// Default tenant guardrail configuration
export const DEFAULT_GUARDRAIL_CONFIG = {
    tenantId: 'default',
    enabled: true,
    threshold: ANSWERABILITY_THRESHOLDS.moderate,
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
