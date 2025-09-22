import { UserContext } from '@cw-rag-core/shared';
export interface SimpleAnswerabilityScore {
    confidence: number;
    isAnswerable: boolean;
    reasoning: string;
    scoreStats: {
        mean: number;
        max: number;
        min: number;
        count: number;
    };
}
export interface GuardrailConfig {
    enabled: boolean;
    minConfidence: number;
    minTopScore: number;
    minMeanScore: number;
    minResultCount: number;
}
export interface IdkTemplateResponse {
    message: string;
    reasonCode: string;
    suggestions?: string[];
}
export declare class SimpleGuardrailService {
    private tenantConfigs;
    constructor();
    evaluateAnswerability(query: string, searchResults: any[], userContext: UserContext): {
        isAnswerable: boolean;
        score: SimpleAnswerabilityScore;
        idkResponse?: IdkTemplateResponse;
    };
    private calculateScore;
    private calculateConfidence;
    private applyThresholds;
    private generateIdkResponse;
    private generateReasoning;
    private getTenantConfig;
    private getDefaultConfig;
    private initializeDefaultConfigs;
    updateTenantConfig(tenantId: string, config: GuardrailConfig): void;
}
export declare const guardrailService: SimpleGuardrailService;
