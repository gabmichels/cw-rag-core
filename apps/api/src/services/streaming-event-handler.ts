import {
  LLMProvider,
  StreamingChunkEvent,
  StreamingCompletionEvent,
  ResponseCompletedEvent,
  ProviderSpecificEvent,
  CitationMap,
  SynthesisMetadata
} from '../types/synthesis.js';

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
  handleResponseCompleted(
    provider: LLMProvider,
    summary: ResponseCompletedEvent['data']['summary'],
    metadata: ResponseCompletedEvent['data']['metadata']
  ): ResponseCompletedEvent;

  /**
   * Convert provider-specific completion data to generic format
   */
  normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'];
}

export class GenericStreamingEventHandler implements StreamingEventHandler {
  private requestId: string;

  constructor(requestId?: string) {
    this.requestId = requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  handleChunk(chunk: string, provider: LLMProvider, metadata?: any): StreamingChunkEvent {
    return {
      type: 'chunk',
      provider,
      timestamp: Date.now(),
      requestId: this.requestId,
      data: chunk
    };
  }

  handleCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent {
    const normalizedData = this.normalizeCompletion(completionData, provider);
    return {
      type: 'completion',
      provider,
      timestamp: Date.now(),
      requestId: this.requestId,
      data: normalizedData
    };
  }

  handleProviderSpecific(data: any, provider: LLMProvider, eventType: string): ProviderSpecificEvent {
    return {
      type: 'provider_specific',
      provider,
      timestamp: Date.now(),
      requestId: this.requestId,
      providerEventType: eventType,
      data
    };
  }

  handleResponseCompleted(
    provider: LLMProvider,
    summary: ResponseCompletedEvent['data']['summary'],
    metadata: ResponseCompletedEvent['data']['metadata']
  ): ResponseCompletedEvent {
    return {
      type: 'response_completed',
      provider,
      timestamp: Date.now(),
      requestId: this.requestId,
      data: {
        summary,
        metadata
      }
    };
  }

  normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'] {
    switch (provider) {
      case 'openai':
      case 'azure-openai':
        return {
          totalTokens: completionData.totalTokens || completionData.usage?.total_tokens || 0,
          completionReason: this.normalizeCompletionReason(completionData.finishReason || completionData.finish_reason),
          model: completionData.model || 'unknown',
          responseMetadata: {
            usage: completionData.usage,
            finishReason: completionData.finishReason || completionData.finish_reason,
            responseId: completionData.id,
            created: completionData.created
          }
        };

      case 'anthropic':
        return {
          totalTokens: completionData.totalTokens || completionData.usage?.output_tokens || 0,
          completionReason: this.normalizeCompletionReason(completionData.stopReason || 'stop'),
          model: completionData.model || 'unknown',
          responseMetadata: {
            usage: completionData.usage,
            stopReason: completionData.stopReason,
            responseId: completionData.id
          }
        };

      case 'vllm':
        return {
          totalTokens: completionData.totalTokens || completionData.usage?.total_tokens || 0,
          completionReason: 'stop', // vLLM typically stops naturally
          model: completionData.model || 'unknown',
          responseMetadata: {
            usage: completionData.usage,
            finishReason: 'stop'
          }
        };

      default:
        return {
          totalTokens: completionData.totalTokens || 0,
          completionReason: 'stop',
          model: completionData.model || 'unknown',
          responseMetadata: completionData
        };
    }
  }

  private normalizeCompletionReason(reason: string | undefined): StreamingCompletionEvent['data']['completionReason'] {
    if (!reason) return 'stop';

    const normalized = reason.toLowerCase();
    if (normalized.includes('stop')) return 'stop';
    if (normalized.includes('length') || normalized.includes('max')) return 'length';
    if (normalized.includes('content') || normalized.includes('filter')) return 'content_filter';
    if (normalized.includes('function') || normalized.includes('tool')) return 'function_call';

    return 'stop'; // Default fallback
  }
}

// Factory function
export function createStreamingEventHandler(requestId?: string): StreamingEventHandler {
  return new GenericStreamingEventHandler(requestId);
}