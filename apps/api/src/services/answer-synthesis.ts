import { HybridSearchResult } from '@cw-rag-core/retrieval';
import { UserContext, calculateFreshnessStats, FreshnessStats } from '@cw-rag-core/shared';
import {
  SynthesisRequest,
  SynthesisResponse,
  AnswerSynthesisError,
  AnswerQualityMetrics,
  CitationMap
} from '../types/synthesis.js';
import { CitationService, createCitationService } from './citation.js';
import { LLMClientFactory, createLLMClientFactory } from './llm-client.js';

export interface AnswerSynthesisService {
  /**
   * Generate an answer with citations from retrieved documents
   */
  synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse>;

  /**
   * Get quality metrics for the last synthesis
   */
  getQualityMetrics(): AnswerQualityMetrics | null;

  /**
   * Validate synthesis configuration
   */
  validateConfiguration(tenantId: string): Promise<boolean>;
}

export class AnswerSynthesisServiceImpl implements AnswerSynthesisService {
  private lastQualityMetrics: AnswerQualityMetrics | null = null;

  constructor(
    private llmClientFactory: LLMClientFactory,
    protected citationService: CitationService,
    private maxContextLength: number = 8000
  ) {}

  async synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse> {
    const startTime = performance.now();

    try {
      // Validate request
      this.validateRequest(request);

      // Extract citations from documents with freshness information
      const tenantId = request.userContext.tenantId || 'default';
      const citations = this.citationService.extractCitations(request.documents, tenantId);

      // Prepare context from documents
      const contextResult = this.prepareContext(
        request.documents,
        citations,
        request.maxContextLength || this.maxContextLength
      );

      // Get LLM client for tenant
      const llmClient = await this.llmClientFactory.createClientForTenant(
        request.userContext.tenantId || 'default'
      );

      // Generate answer
      const completion = await llmClient.generateCompletion(
        request.query,
        contextResult.context,
        1000 // max tokens for answer
      );

      // Format answer with citations
      const formattedAnswer = this.formatAnswerWithCitations(
        completion.text,
        citations,
        request.answerFormat || 'markdown'
      );

      // Calculate freshness statistics
      const freshnessStats = this.calculateFreshnessStats(request.documents, tenantId);

      // Calculate confidence based on context quality, LLM response, and freshness
      const confidence = this.calculateConfidence(
        request.documents,
        contextResult.contextTruncated,
        completion.text,
        freshnessStats
      );

      const synthesisTime = performance.now() - startTime;

      // Store quality metrics
      this.lastQualityMetrics = {
        answerLength: formattedAnswer.length,
        citationCount: Object.keys(citations).length,
        contextUtilization: contextResult.utilizationRatio,
        responseLatency: synthesisTime,
        llmProvider: llmClient.getConfig().provider,
        model: completion.model
      };

      const response: SynthesisResponse = {
        answer: formattedAnswer,
        citations,
        tokensUsed: completion.tokensUsed,
        synthesisTime,
        confidence,
        modelUsed: completion.model,
        contextTruncated: contextResult.contextTruncated,
        freshnessStats
      };

      return response;

    } catch (error) {
      throw new AnswerSynthesisError(
        `Failed to synthesize answer: ${(error as Error).message}`,
        'SYNTHESIS_FAILED',
        {
          query: request.query,
          documentCount: request.documents.length,
          tenantId: request.userContext.tenantId
        }
      );
    }
  }

  getQualityMetrics(): AnswerQualityMetrics | null {
    return this.lastQualityMetrics;
  }

  async validateConfiguration(tenantId: string): Promise<boolean> {
    try {
      // Check if LLM client can be created
      const client = await this.llmClientFactory.createClientForTenant(tenantId);
      const config = client.getConfig();

      // Validate required configuration
      if (!config.provider || !config.model) {
        return false;
      }

      // Test basic functionality with a simple prompt
      await client.generateCompletion(
        'Test configuration',
        'This is a test context.',
        10
      );

      return true;

    } catch (error) {
      console.error(`Configuration validation failed for tenant ${tenantId}:`, error);
      return false;
    }
  }

  private validateRequest(request: SynthesisRequest): void {
    if (!request.query || request.query.trim().length === 0) {
      throw new AnswerSynthesisError(
        'Query cannot be empty',
        'INVALID_REQUEST'
      );
    }

    if (!request.documents || request.documents.length === 0) {
      throw new AnswerSynthesisError(
        'No documents provided for synthesis',
        'INVALID_REQUEST'
      );
    }

    if (!request.userContext || !request.userContext.id) {
      throw new AnswerSynthesisError(
        'Valid user context is required',
        'INVALID_REQUEST'
      );
    }
  }

  private prepareContext(
    documents: HybridSearchResult[],
    citations: CitationMap,
    maxLength: number
  ): {
    context: string;
    contextTruncated: boolean;
    utilizationRatio: number;
  } {
    let context = '';
    let totalCharacters = 0;
    let truncated = false;

    // Sort documents by score (descending) to prioritize higher-quality content
    const sortedDocuments = [...documents]
      .sort((a, b) => (b.fusionScore || b.score || 0) - (a.fusionScore || a.score || 0));

    for (let i = 0; i < sortedDocuments.length; i++) {
      const doc = sortedDocuments[i];
      const citationNumber = i + 1;

      // Find the citation for this document
      const citation = Object.values(citations).find(c => c.id === doc.id);
      if (!citation) continue;

      const content = doc.content || '';
      const docSection = `\n\n[Document ${citationNumber}] (Source: ${citation.source})\n${content}`;

      // Check if adding this document would exceed the limit
      if (totalCharacters + docSection.length > maxLength) {
        if (context.length === 0) {
          // If even the first document is too long, truncate it
          const availableSpace = maxLength - `\n\n[Document ${citationNumber}] (Source: ${citation.source})\n`.length;
          const truncatedContent = content.substring(0, availableSpace - 20) + '...';
          context += `\n\n[Document ${citationNumber}] (Source: ${citation.source})\n${truncatedContent}`;
          totalCharacters = maxLength;
        }
        truncated = true;
        break;
      }

      context += docSection;
      totalCharacters += docSection.length;
    }

    const utilizationRatio = Math.min(totalCharacters / maxLength, 1.0);

    return {
      context: context.trim(),
      contextTruncated: truncated,
      utilizationRatio
    };
  }

  private formatAnswerWithCitations(
    answer: string,
    citations: CitationMap,
    format: 'markdown' | 'plain'
  ): string {
    if (format === 'plain') {
      // Remove citation markers for plain text
      return answer.replace(/\[\^?\d+\]/g, '').trim();
    }

    // Validate and format citations
    const formattedAnswer = this.citationService.formatTextWithCitations(answer, citations);

    // Add bibliography if citations exist
    if (Object.keys(citations).length > 0) {
      const bibliography = this.citationService.generateBibliography(citations);
      return formattedAnswer + bibliography;
    }

    return formattedAnswer;
  }

  private calculateConfidence(
    documents: HybridSearchResult[],
    contextTruncated: boolean,
    answer: string,
    freshnessStats?: FreshnessStats
  ): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence if context was truncated
    if (contextTruncated) {
      confidence *= 0.8;
    }

    // Adjust based on document quality
    if (documents.length > 0) {
      const avgScore = documents.reduce((sum, doc) =>
        sum + (doc.fusionScore || doc.score || 0), 0) / documents.length;
      confidence *= Math.min(avgScore + 0.3, 1.0);
    }

    // Adjust confidence based on document freshness
    if (freshnessStats && freshnessStats.totalDocuments > 0) {
      const freshnessFactor = (
        (freshnessStats.freshPercentage * 1.0) +  // Fresh documents get full weight
        (freshnessStats.recentPercentage * 0.8) + // Recent documents get 80% weight
        (freshnessStats.stalePercentage * 0.6)    // Stale documents get 60% weight
      ) / 100;

      confidence *= Math.max(0.6, freshnessFactor); // Don't reduce below 60% for freshness
    }

    // Reduce confidence for very short answers (likely incomplete)
    if (answer.length < 50) {
      confidence *= 0.6;
    }

    // Check for "I don't know" responses
    const idkPatterns = [
      /i don't have enough information/i,
      /cannot answer/i,
      /not enough context/i,
      /insufficient information/i
    ];

    if (idkPatterns.some(pattern => pattern.test(answer))) {
      confidence = 0.1; // Very low confidence for IDK responses
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateFreshnessStats(documents: HybridSearchResult[], tenantId: string): FreshnessStats {
    const docTimestamps = documents.map(doc => ({
      modifiedAt: doc.payload?.modifiedAt,
      createdAt: doc.payload?.createdAt
    }));

    return calculateFreshnessStats(docTimestamps, tenantId);
  }
}

/**
 * Enhanced synthesis service with additional quality controls
 */
export class EnhancedAnswerSynthesisService extends AnswerSynthesisServiceImpl {
  constructor(
    llmClientFactory: LLMClientFactory,
    citationService: CitationService,
    maxContextLength: number = 8000,
    private qualityThresholds: {
      minConfidence: number;
      minCitations: number;
      maxLatency: number;
    } = {
      minConfidence: 0.3,
      minCitations: 1,
      maxLatency: 5000
    }
  ) {
    super(llmClientFactory, citationService, maxContextLength);
  }

  async synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResponse> {
    const response = await super.synthesizeAnswer(request);

    // Apply quality controls
    this.validateQuality(response);

    return response;
  }

  private validateQuality(response: SynthesisResponse): void {
    // Check confidence threshold
    if (response.confidence < this.qualityThresholds.minConfidence) {
      console.warn(`Answer confidence ${response.confidence} below threshold ${this.qualityThresholds.minConfidence}`);
    }

    // Check citation count
    const citationCount = Object.keys(response.citations).length;
    if (citationCount < this.qualityThresholds.minCitations) {
      console.warn(`Citation count ${citationCount} below threshold ${this.qualityThresholds.minCitations}`);
    }

    // Check latency
    if (response.synthesisTime > this.qualityThresholds.maxLatency) {
      console.warn(`Synthesis time ${response.synthesisTime}ms above threshold ${this.qualityThresholds.maxLatency}ms`);
    }

    // Validate citation accuracy
    if (!this.citationService.validateCitations(response.answer, response.citations)) {
      throw new AnswerSynthesisError(
        'Answer contains invalid citations',
        'CITATION_VALIDATION_FAILED'
      );
    }
  }
}

/**
 * Factory function for creating answer synthesis service
 */
export function createAnswerSynthesisService(
  enhanced: boolean = true,
  maxContextLength: number = 8000
): AnswerSynthesisService {
  const llmClientFactory = createLLMClientFactory(true);
  const citationService = createCitationService(true);

  return enhanced
    ? new EnhancedAnswerSynthesisService(llmClientFactory, citationService, maxContextLength)
    : new AnswerSynthesisServiceImpl(llmClientFactory, citationService, maxContextLength);
}