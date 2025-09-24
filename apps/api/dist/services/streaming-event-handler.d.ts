import { LLMProvider, StreamingChunkEvent, StreamingCompletionEvent, ResponseCompletedEvent, ProviderSpecificEvent } from '../types/synthesis.js';
export interface StreamingEventHandler {
    /**
     * Process a text chunk from any provider
     */
    handleChunk(chunk: string, provider: LLMProvider, metadata?: any): StreamingChunkEvent;
    /**
     * Process completion event from any provider
     */
    handleCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent;
    /**
     * Handle provider-specific events
     */
    handleProviderSpecific(data: any, provider: LLMProvider, eventType: string): ProviderSpecificEvent;
    /**
     * Create a response completed event
     */
    handleResponseCompleted(provider: LLMProvider, summary: ResponseCompletedEvent['data']['summary'], metadata: ResponseCompletedEvent['data']['metadata']): ResponseCompletedEvent;
    /**
     * Convert provider-specific completion data to generic format
     */
    normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'];
}
export declare class GenericStreamingEventHandler implements StreamingEventHandler {
    private requestId;
    constructor(requestId?: string);
    handleChunk(chunk: string, provider: LLMProvider, metadata?: any): StreamingChunkEvent;
    handleCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent;
    handleProviderSpecific(data: any, provider: LLMProvider, eventType: string): ProviderSpecificEvent;
    handleResponseCompleted(provider: LLMProvider, summary: ResponseCompletedEvent['data']['summary'], metadata: ResponseCompletedEvent['data']['metadata']): ResponseCompletedEvent;
    normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'];
    private normalizeCompletionReason;
}
export declare function createStreamingEventHandler(requestId?: string): StreamingEventHandler;
