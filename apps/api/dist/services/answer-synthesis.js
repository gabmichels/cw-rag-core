import { createAnswerabilityGuardrailService } from '@cw-rag-core/retrieval';
import { calculateFreshnessStats } from '@cw-rag-core/shared';
import { AnswerSynthesisError } from '../types/synthesis.js';
import { createCitationService } from './citation.js';
import { createLLMClientFactory } from './llm-client.js';
import { createStreamingEventHandler } from './streaming-event-handler.js';
export class AnswerSynthesisServiceImpl {
    llmClientFactory;
    citationService;
    maxContextLength;
    lastQualityMetrics = null;
    guardrailService;
    streamingEventHandler;
    constructor(llmClientFactory, citationService, maxContextLength = 8000) {
        this.llmClientFactory = llmClientFactory;
        this.citationService = citationService;
        this.maxContextLength = maxContextLength;
        this.guardrailService = createAnswerabilityGuardrailService();
        this.streamingEventHandler = createStreamingEventHandler();
    }
    async synthesizeAnswer(request) {
        const startTime = performance.now();
        try {
            // Validate request
            this.validateRequest(request);
            // Use passed guardrail decision if available, otherwise evaluate
            let guardrailDecision;
            if (request.guardrailDecision) {
                // Trust the pre-evaluated guardrail decision from the main retrieval pipeline
                guardrailDecision = {
                    isAnswerable: request.guardrailDecision.isAnswerable,
                    score: {
                        confidence: request.guardrailDecision.confidence,
                        ...request.guardrailDecision.score
                    }
                };
                console.log(`Using pre-evaluated guardrail decision: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
            }
            else {
                // Fallback: Check answerability guardrail
                // The answer synthesis service only receives the already fused documents.
                // We pass them as fusionResults for source-aware confidence calculation.
                guardrailDecision = await this.guardrailService.evaluateAnswerability(request.query, {
                    vectorResults: [], // Not available at this stage
                    keywordResults: [], // Not available at this stage
                    fusionResults: request.documents,
                    rerankerResults: undefined // Not available as RerankerResult[] at this stage
                }, request.userContext);
                console.log(`Evaluated guardrail decision: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
            }
            const tenantId = request.userContext.tenantId || 'default';
            const answerabilityThreshold = parseFloat(process.env.ANSWERABILITY_THRESHOLD || '0.5'); // Retain for clarity/future use if needed
            // If not answerable according to guardrail's definitive decision, return IDK response
            if (!guardrailDecision.isAnswerable) {
                console.log(`Answerability guardrail triggered IDK: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
                const idkResponse = this.guardrailService.generateIdkResponse(guardrailDecision.score, await this.guardrailService.getTenantConfig(tenantId), request.documents // Still pass unfiltered documents for suggestions
                );
                const synthesisTime = performance.now() - startTime;
                return {
                    answer: idkResponse.message,
                    citations: {},
                    tokensUsed: 0,
                    synthesisTime,
                    confidence: guardrailDecision.score.confidence, // Use confidence from guardrailDecision
                    modelUsed: 'guardrail',
                    contextTruncated: false,
                    freshnessStats: this.calculateFreshnessStats(request.documents, tenantId)
                };
            }
            // Extract citations from documents with freshness information
            const citations = this.citationService.extractCitations(request.documents, tenantId);
            // Prepare context from documents
            const contextResult = this.prepareContext(request.documents, citations, request.maxContextLength || this.maxContextLength);
            // Get LLM client for tenant
            const llmClient = await this.llmClientFactory.createClientForTenant(request.userContext.tenantId || 'default');
            // Generate answer
            const completion = await llmClient.generateCompletion(request.query, contextResult.context, 1000, // max tokens for answer
            {
                isAnswerable: guardrailDecision.isAnswerable,
                confidence: guardrailDecision.score.confidence,
                score: guardrailDecision.score
            });
            // Format answer with citations
            const formattedAnswer = this.formatAnswerWithCitations(completion.text, citations, request.answerFormat || 'markdown');
            // Calculate freshness statistics
            const freshnessStats = this.calculateFreshnessStats(request.documents, tenantId);
            // Calculate confidence based on context quality, LLM response, and freshness
            const confidence = this.calculateConfidence(request.documents, contextResult.contextTruncated, completion.text, freshnessStats);
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
            const response = {
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
        }
        catch (error) {
            throw new AnswerSynthesisError(`Failed to synthesize answer: ${error.message}`, 'SYNTHESIS_FAILED', {
                query: request.query,
                documentCount: request.documents.length,
                tenantId: request.userContext.tenantId
            });
        }
    }
    async *synthesizeAnswerStreaming(request) {
        const startTime = performance.now();
        try {
            // Validate request
            this.validateRequest(request);
            // Use passed guardrail decision if available, otherwise evaluate
            let guardrailDecision;
            if (request.guardrailDecision) {
                // Trust the pre-evaluated guardrail decision from the main retrieval pipeline
                guardrailDecision = {
                    isAnswerable: request.guardrailDecision.isAnswerable,
                    score: {
                        confidence: request.guardrailDecision.confidence,
                        ...request.guardrailDecision.score
                    }
                };
                console.log(`Using pre-evaluated guardrail decision: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
            }
            else {
                // Fallback: Check answerability guardrail
                // The answer synthesis service only receives the already fused documents.
                // We pass them as fusionResults for source-aware confidence calculation.
                guardrailDecision = await this.guardrailService.evaluateAnswerability(request.query, {
                    vectorResults: [],
                    keywordResults: [],
                    fusionResults: request.documents,
                    rerankerResults: undefined
                }, request.userContext);
                console.log(`Evaluated guardrail decision: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
            }
            const tenantId = request.userContext.tenantId || 'default';
            const answerabilityThreshold = parseFloat(process.env.ANSWERABILITY_THRESHOLD || '0.5');
            // If not answerable according to guardrail's definitive decision, return IDK response
            if (!guardrailDecision.isAnswerable) {
                console.log(`Answerability guardrail triggered IDK: confidence=${guardrailDecision.score.confidence}, isAnswerable=${guardrailDecision.isAnswerable}`);
                const idkResponse = this.guardrailService.generateIdkResponse(guardrailDecision.score, await this.guardrailService.getTenantConfig(tenantId), request.documents // Still pass unfiltered documents for suggestions
                );
                const synthesisTime = performance.now() - startTime;
                // Emit IDK response as a single chunk
                yield {
                    type: 'chunk',
                    data: idkResponse.message
                };
                // Emit metadata
                yield {
                    type: 'metadata',
                    data: {
                        tokensUsed: 0,
                        synthesisTime,
                        confidence: guardrailDecision.score.confidence, // Use confidence from guardrailDecision
                        modelUsed: 'guardrail',
                        contextTruncated: false,
                        freshnessStats: this.calculateFreshnessStats(request.documents, tenantId)
                    }
                };
                yield {
                    type: 'done',
                    data: null
                };
                return;
            }
            // Extract citations from documents with freshness information
            const citations = this.citationService.extractCitations(request.documents, tenantId);
            // Prepare context from documents
            const contextResult = this.prepareContext(request.documents, citations, request.maxContextLength || this.maxContextLength);
            // Get LLM client for tenant
            const llmClient = await this.llmClientFactory.createClientForTenant(request.userContext.tenantId || 'default');
            // Check if streaming is supported
            if (!llmClient.supportsStreaming()) {
                // Fallback to non-streaming
                const result = await this.synthesizeAnswer(request);
                yield {
                    type: 'chunk',
                    data: result.answer
                };
                yield {
                    type: 'citations',
                    data: result.citations
                };
                yield {
                    type: 'metadata',
                    data: {
                        tokensUsed: result.tokensUsed,
                        synthesisTime: result.synthesisTime,
                        confidence: result.confidence,
                        modelUsed: result.modelUsed,
                        contextTruncated: result.contextTruncated,
                        freshnessStats: result.freshnessStats
                    }
                };
                yield {
                    type: 'done',
                    data: null
                };
                return;
            }
            let fullAnswer = '';
            let totalTokens = 0;
            let totalChunks = 0;
            let completionReason = 'stop';
            let llmProvider = llmClient.getConfig().provider;
            // Generate streaming answer with enhanced event tracking
            for await (const chunk of llmClient.generateStreamingCompletion(request.query, contextResult.context, 1000, {
                isAnswerable: guardrailDecision.isAnswerable,
                confidence: guardrailDecision.score.confidence,
                score: guardrailDecision.score
            })) {
                if (chunk.type === 'chunk' && typeof chunk.data === 'string') {
                    fullAnswer += chunk.data;
                    totalChunks++;
                    yield {
                        type: 'chunk',
                        data: chunk.data
                    };
                }
                else if (chunk.type === 'completion' && chunk.data) {
                    // Handle completion event from LLM client
                    totalTokens = chunk.data.totalTokens || totalTokens;
                    completionReason = chunk.data.completionReason || completionReason;
                    // Don't yield completion event directly - we'll handle it in ResponseCompletedEvent
                }
                else if (chunk.type === 'error') {
                    yield chunk;
                    return;
                }
                else if (chunk.type === 'done') {
                    break;
                }
            }
            // Format answer with citations
            const formattedAnswer = this.formatAnswerWithCitations(fullAnswer, citations, request.answerFormat || 'markdown');
            // Calculate freshness statistics
            const freshnessStats = this.calculateFreshnessStats(request.documents, tenantId);
            // Calculate confidence (this confidence is for the LLM's raw answer, distinct from guardrail's overall decision)
            const confidence = this.calculateConfidence(request.documents, contextResult.contextTruncated, fullAnswer, freshnessStats);
            const synthesisTime = performance.now() - startTime;
            // Store quality metrics
            this.lastQualityMetrics = {
                answerLength: formattedAnswer.length,
                citationCount: Object.keys(citations).length,
                contextUtilization: contextResult.utilizationRatio,
                responseLatency: synthesisTime,
                llmProvider: llmClient.getConfig().provider,
                model: llmClient.getConfig().model
            };
            // Emit citations
            yield {
                type: 'citations',
                data: citations
            };
            // Emit metadata
            const synthesisMetadata = {
                tokensUsed: totalTokens,
                synthesisTime,
                // Use guardrail decision's confidence here for consistency with the overall decision
                confidence: guardrailDecision.score.confidence,
                modelUsed: llmClient.getConfig().model,
                contextTruncated: contextResult.contextTruncated,
                freshnessStats
            };
            yield {
                type: 'metadata',
                data: synthesisMetadata
            };
            // Emit ResponseCompletedEvent before done
            const responseCompletedEvent = this.streamingEventHandler.handleResponseCompleted(llmProvider, {
                totalChunks,
                totalTokens,
                responseTime: synthesisTime,
                completionReason,
                success: true
            }, {
                citations,
                synthesisMetadata,
                qualityMetrics: this.lastQualityMetrics
            });
            yield {
                type: 'response_completed',
                data: responseCompletedEvent.data
            };
            yield {
                type: 'done',
                data: null
            };
        }
        catch (error) {
            yield {
                type: 'error',
                data: new AnswerSynthesisError(`Failed to synthesize answer: ${error.message}`, 'SYNTHESIS_FAILED', {
                    query: request.query,
                    documentCount: request.documents.length,
                    tenantId: request.userContext.tenantId
                })
            };
        }
    }
    getQualityMetrics() {
        return this.lastQualityMetrics;
    }
    async validateConfiguration(tenantId) {
        try {
            // Check if LLM client can be created
            const client = await this.llmClientFactory.createClientForTenant(tenantId);
            const config = client.getConfig();
            // Validate required configuration
            if (!config.provider || !config.model) {
                return false;
            }
            // Test basic functionality with a simple prompt
            await client.generateCompletion('Test configuration', 'This is a test context.', 10);
            return true;
        }
        catch (error) {
            console.error(`Configuration validation failed for tenant ${tenantId}:`, error);
            return false;
        }
    }
    validateRequest(request) {
        if (!request.query || request.query.trim().length === 0) {
            throw new AnswerSynthesisError('Query cannot be empty', 'INVALID_REQUEST');
        }
        if (!request.documents || request.documents.length === 0) {
            throw new AnswerSynthesisError('No documents provided for synthesis', 'INVALID_REQUEST');
        }
        if (!request.userContext || !request.userContext.id) {
            throw new AnswerSynthesisError('Valid user context is required', 'INVALID_REQUEST');
        }
    }
    prepareContext(documents, citations, maxLength) {
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
            if (!citation)
                continue;
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
    formatAnswerWithCitations(answer, citations, format) {
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
    calculateConfidence(documents, contextTruncated, answer, freshnessStats) {
        let confidence = 0.8; // Base confidence
        // Reduce confidence if context was truncated
        if (contextTruncated) {
            confidence *= 0.8;
        }
        // Adjust based on document quality
        if (documents.length > 0) {
            const avgScore = documents.reduce((sum, doc) => sum + (doc.fusionScore || doc.score || 0), 0) / documents.length;
            confidence *= Math.min(avgScore + 0.3, 1.0);
        }
        // Adjust confidence based on document freshness
        if (freshnessStats && freshnessStats.totalDocuments > 0) {
            const freshnessFactor = ((freshnessStats.freshPercentage * 1.0) + // Fresh documents get full weight
                (freshnessStats.recentPercentage * 0.8) + // Recent documents get 80% weight
                (freshnessStats.stalePercentage * 0.6) // Stale documents get 60% weight
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
    calculateFreshnessStats(documents, tenantId) {
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
    qualityThresholds;
    constructor(llmClientFactory, citationService, maxContextLength = 8000, qualityThresholds = {
        minConfidence: 0.3,
        minCitations: 1,
        maxLatency: 5000
    }) {
        super(llmClientFactory, citationService, maxContextLength);
        this.qualityThresholds = qualityThresholds;
    }
    async synthesizeAnswer(request) {
        const response = await super.synthesizeAnswer(request);
        // Apply quality controls
        this.validateQuality(response);
        return response;
    }
    async *synthesizeAnswerStreaming(request) {
        let response = null;
        const chunks = [];
        for await (const chunk of super.synthesizeAnswerStreaming(request)) {
            // Collect chunks to build full response for quality validation
            if (chunk.type === 'chunk' && typeof chunk.data === 'string') {
                chunks.push(chunk.data);
            }
            else if (chunk.type === 'metadata') {
                response = chunk.data;
            }
            // Always yield the chunk
            yield chunk;
            // If this is the done signal, validate quality
            if (chunk.type === 'done') {
                if (response) {
                    const fullAnswer = chunks.join('');
                    const synthResponse = {
                        answer: fullAnswer,
                        citations: {},
                        tokensUsed: response.tokensUsed || 0,
                        synthesisTime: response.synthesisTime || 0,
                        confidence: response.confidence || 0,
                        modelUsed: response.modelUsed || '',
                        contextTruncated: response.contextTruncated || false,
                        freshnessStats: response.freshnessStats
                    };
                    try {
                        this.validateQuality(synthResponse);
                    }
                    catch (error) {
                        // Quality validation failed, but we've already streamed the response
                        console.warn('Quality validation failed for streamed response:', error);
                    }
                }
                break;
            }
        }
    }
    validateQuality(response) {
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
            throw new AnswerSynthesisError('Answer contains invalid citations', 'CITATION_VALIDATION_FAILED');
        }
    }
}
/**
 * Factory function for creating answer synthesis service
 */
export function createAnswerSynthesisService(enhanced = true, maxContextLength = 8000) {
    const llmClientFactory = createLLMClientFactory(true);
    const citationService = createCitationService(true);
    return enhanced
        ? new EnhancedAnswerSynthesisService(llmClientFactory, citationService, maxContextLength)
        : new AnswerSynthesisServiceImpl(llmClientFactory, citationService, maxContextLength);
}
