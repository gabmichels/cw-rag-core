import { SynthesisRequest, SynthesisResponse, AnswerQualityMetrics, StreamingSynthesisResponse } from '../types/synthesis.js';
import { CitationService } from './citation.js';
import { LLMClientFactory } from './llm-client.js';
export interface AnswerSynthesisService {
    /**
     * Generate an answer with citations from retrieved documents
     */
    synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse>;
    /**
     * Generate streaming answer with citations from retrieved documents
     */
    synthesizeAnswerStreaming(request: SynthesisRequest): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;
    /**
     * Get quality metrics for the last synthesis
     */
    getQualityMetrics(): AnswerQualityMetrics | null;
    /**
     * Validate synthesis configuration
     */
    validateConfiguration(tenantId: string): Promise<boolean>;
}
export declare class AnswerSynthesisServiceImpl implements AnswerSynthesisService {
    private llmClientFactory;
    protected citationService: CitationService;
    private maxContextLength;
    private lastQualityMetrics;
    private guardrailService;
    constructor(llmClientFactory: LLMClientFactory, citationService: CitationService, maxContextLength?: number);
    synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse>;
    synthesizeAnswerStreaming(request: SynthesisRequest): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;
    getQualityMetrics(): AnswerQualityMetrics | null;
    validateConfiguration(tenantId: string): Promise<boolean>;
    private validateRequest;
    private prepareContext;
    private formatAnswerWithCitations;
    private calculateConfidence;
    private calculateFreshnessStats;
}
/**
 * Enhanced synthesis service with additional quality controls
 */
export declare class EnhancedAnswerSynthesisService extends AnswerSynthesisServiceImpl {
    private qualityThresholds;
    constructor(llmClientFactory: LLMClientFactory, citationService: CitationService, maxContextLength?: number, qualityThresholds?: {
        minConfidence: number;
        minCitations: number;
        maxLatency: number;
    });
    synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse>;
    synthesizeAnswerStreaming(request: SynthesisRequest): AsyncGenerator<StreamingSynthesisResponse, void, unknown>;
    private validateQuality;
}
/**
 * Factory function for creating answer synthesis service
 */
export declare function createAnswerSynthesisService(enhanced?: boolean, maxContextLength?: number): AnswerSynthesisService;
