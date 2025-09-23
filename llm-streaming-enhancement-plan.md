# LLM Streaming Enhancement Implementation Plan

## Current State Analysis

### What's Already Implemented
- **vLLM Streaming**: Fully functional with Server-Sent Events (SSE) parsing
- **Generic Streaming Interface**: `StreamingSynthesisResponse` with event types: `chunk`, `citations`, `metadata`, `error`, `done`
- **Route Integration**: `/ask` route handles streaming when `LLM_STREAMING=true`
- **Answer Synthesis Streaming**: `synthesizeAnswerStreaming` method collects chunks and builds complete response
- **Environment Control**: `LLM_STREAMING` environment variable controls streaming behavior

### Current Gaps
1. **OpenAI Streaming**: Falls back to non-streaming completion, then wraps as single chunk
2. **Generic Event System**: No centralized streaming event handling across providers
3. **Completion Events**: No `ResponseCompletedEvent` handling as requested
4. **Provider-Specific Events**: No mechanism for OpenAI-specific vs vLLM-specific events

## Enhanced Architecture Design

### 1. Enhanced Streaming Types

```typescript
// Enhanced streaming event types
export interface BaseStreamingEvent {
  type: string;
  provider: LLMProvider;
  timestamp: number;
  requestId?: string;
}

export interface StreamingChunkEvent extends BaseStreamingEvent {
  type: 'chunk';
  data: string;
}

export interface StreamingCompletionEvent extends BaseStreamingEvent {
  type: 'completion';
  data: {
    totalTokens: number;
    completionReason: 'stop' | 'length' | 'content_filter' | 'function_call';
    model: string;
    responseMetadata: any;
  };
}

export interface ProviderSpecificEvent<T = any> extends BaseStreamingEvent {
  type: 'provider_specific';
  providerEventType: string;
  data: T;
}

// Union type for all streaming events
export type StreamingEvent =
  | StreamingChunkEvent
  | StreamingCompletionEvent
  | ProviderSpecificEvent
  | BaseStreamingEvent; // For backwards compatibility
```

### 2. Generic Streaming Event Handler

```typescript
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
   * Convert provider-specific completion data to generic format
   */
  normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'];
}
```

### 3. OpenAI Streaming Implementation Strategy

#### Current Issue
The `generateStreamingCompletion` method in `LLMClientImpl` for OpenAI providers currently:
1. Falls back to `generateCompletion` (non-streaming)
2. Wraps the complete result as a single chunk
3. Returns `done` event

#### Proposed Solution
Implement proper OpenAI streaming using LangChain's streaming capabilities:

```typescript
// In LLMClientImpl class
async *generateStreamingCompletion(
  prompt: string,
  context: string,
  maxTokens?: number,
  guardrailDecision?: any
): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
  if (this.config.provider === 'openai' || this.config.provider === 'anthropic') {
    // Use LangChain's streaming capabilities
    yield* this.generateLangChainStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
    return;
  }

  if (this.config.provider === 'vllm') {
    yield* this.generateVLLMStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
    return;
  }

  // Fallback for other providers
  const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision);
  yield { type: 'chunk', data: result.text };
  yield { type: 'done', data: null };
}
```

#### LangChain Streaming Implementation
```typescript
private async *generateLangChainStreamingCompletion(
  prompt: string,
  context: string,
  maxTokens?: number,
  guardrailDecision?: any
): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
  const systemPrompt = this.buildSystemPrompt(guardrailDecision);
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt.replace('{context}', context)],
    ['human', '{query}']
  ]);

  const formattedPrompt = await promptTemplate.format({
    context,
    query: prompt
  });

  let totalTokens = 0;
  let completionReason = 'stop';

  try {
    // Use LangChain's streaming
    for await (const chunk of this.model.stream(formattedPrompt)) {
      const content = typeof chunk.content === 'string'
        ? chunk.content
        : chunk.content.toString();

      if (content) {
        totalTokens += this.estimateTokens(content);
        yield {
          type: 'chunk',
          data: content
        };
      }

      // Check for completion metadata
      if (chunk.response_metadata?.finish_reason) {
        completionReason = chunk.response_metadata.finish_reason;
      }
    }

    // Emit completion event
    yield {
      type: 'completion',
      data: {
        totalTokens,
        completionReason,
        model: this.config.model,
        provider: this.config.provider
      }
    } as any; // Will be properly typed with enhanced types

    yield {
      type: 'done',
      data: null
    };

  } catch (error) {
    yield {
      type: 'error',
      data: error as Error
    };
  }
}
```

### 4. Enhanced Event Processing

#### Generic Event Handler Implementation
```typescript
export class GenericStreamingEventHandler implements StreamingEventHandler {
  handleChunk(chunk: string, provider: LLMProvider, metadata?: any): StreamingChunkEvent {
    return {
      type: 'chunk',
      provider,
      timestamp: Date.now(),
      data: chunk
    };
  }

  handleCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent {
    const normalizedData = this.normalizeCompletion(completionData, provider);
    return {
      type: 'completion',
      provider,
      timestamp: Date.now(),
      data: normalizedData
    };
  }

  handleProviderSpecific(data: any, provider: LLMProvider, eventType: string): ProviderSpecificEvent {
    return {
      type: 'provider_specific',
      provider,
      timestamp: Date.now(),
      providerEventType: eventType,
      data
    };
  }

  normalizeCompletion(completionData: any, provider: LLMProvider): StreamingCompletionEvent['data'] {
    switch (provider) {
      case 'openai':
        return {
          totalTokens: completionData.totalTokens || 0,
          completionReason: completionData.completionReason || 'stop',
          model: completionData.model || 'unknown',
          responseMetadata: completionData
        };

      case 'vllm':
        return {
          totalTokens: completionData.totalTokens || 0,
          completionReason: 'stop', // vLLM typically stops naturally
          model: completionData.model || 'unknown',
          responseMetadata: completionData
        };

      default:
        return {
          totalTokens: 0,
          completionReason: 'stop',
          model: 'unknown',
          responseMetadata: completionData
        };
    }
  }
}
```

### 5. Provider Configuration Enhancement

#### Environment Variable Control
The `LLM_STREAMING` environment variable will continue to be the master switch, but we'll add provider-specific configuration:

```typescript
interface EnhancedLLMConfig extends LLMConfig {
  streaming?: boolean;
  streamingOptions?: {
    bufferSize?: number;
    flushInterval?: number;
    enableProviderEvents?: boolean;
    enableCompletionEvents?: boolean;
  };
}
```

#### Configuration Reading
```typescript
private initializeDefaultConfigs(): void {
  const llmStreaming = process.env.LLM_STREAMING === 'true';
  const llmProvider = (process.env.LLM_PROVIDER as LLMProvider) || 'openai';

  const defaultConfig: EnhancedLLMConfig = {
    provider: llmProvider,
    model: process.env.LLM_MODEL || 'gpt-4.1-2025-04-14',
    temperature: 0.1,
    maxTokens: 1000,
    streaming: llmStreaming,
    streamingOptions: {
      enableProviderEvents: true,
      enableCompletionEvents: true,
      bufferSize: 1024,
      flushInterval: 100
    },
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '25000')
  };

  // Provider-specific configuration
  if (llmProvider === 'vllm') {
    defaultConfig.baseURL = process.env.LLM_ENDPOINT;
  }

  // ... rest of configuration
}
```

### 6. ResponseCompletedEvent Implementation

#### Event Definition
```typescript
export interface ResponseCompletedEvent {
  type: 'response_completed';
  provider: LLMProvider;
  timestamp: number;
  summary: {
    totalChunks: number;
    totalTokens: number;
    responseTime: number;
    completionReason: string;
    success: boolean;
  };
  metadata: {
    citations: any;
    synthesisMetadata: any;
    qualityMetrics: any;
  };
}
```

#### Integration in Answer Synthesis
```typescript
// In synthesizeAnswerStreaming method
async *synthesizeAnswerStreaming(request: SynthesisRequest): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
  const startTime = performance.now();
  let totalChunks = 0;
  let totalTokens = 0;
  let completionReason = 'stop';

  // ... existing logic ...

  // Track streaming progress
  for await (const chunk of llmClient.generateStreamingCompletion(...)) {
    if (chunk.type === 'chunk') {
      totalChunks++;
      yield chunk;
    } else if (chunk.type === 'completion') {
      totalTokens = chunk.data.totalTokens;
      completionReason = chunk.data.completionReason;
      // Don't yield completion event directly - handle internally
    } else if (chunk.type === 'done') {
      break;
    } else {
      yield chunk;
    }
  }

  // ... citations and metadata logic ...

  // Emit ResponseCompletedEvent
  const responseTime = performance.now() - startTime;
  yield {
    type: 'response_completed',
    data: {
      provider: llmClient.getConfig().provider,
      summary: {
        totalChunks,
        totalTokens,
        responseTime,
        completionReason,
        success: true
      },
      metadata: {
        citations,
        synthesisMetadata: { /* ... */ },
        qualityMetrics: this.lastQualityMetrics
      }
    }
  } as any; // Will be properly typed

  yield { type: 'done', data: null };
}
```

### 7. Backwards Compatibility

#### Maintaining Current Interface
The existing `StreamingSynthesisResponse` type will be maintained:
```typescript
export interface StreamingSynthesisResponse {
  type: 'chunk' | 'citations' | 'metadata' | 'error' | 'done' | 'completion' | 'response_completed';
  data: string | CitationMap | SynthesisMetadata | Error | null | any;
}
```

#### Route Integration
The `/ask` route will continue to work exactly as before, but with enhanced streaming capabilities:
- OpenAI requests will now stream properly instead of falling back
- Additional completion events will be available but won't break existing clients
- `LLM_STREAMING=true` continues to control all streaming behavior

### 8. Error Handling and Fallbacks

#### Streaming Failure Fallback
```typescript
private async *generateStreamingWithFallback(
  prompt: string,
  context: string,
  maxTokens?: number,
  guardrailDecision?: any
): AsyncGenerator<StreamingSynthesisResponse, void, unknown> {
  try {
    yield* this.generateStreamingCompletion(prompt, context, maxTokens, guardrailDecision);
  } catch (error) {
    console.warn('Streaming failed, falling back to non-streaming:', error);

    try {
      const result = await this.generateCompletion(prompt, context, maxTokens, guardrailDecision);
      yield { type: 'chunk', data: result.text };
      yield {
        type: 'completion',
        data: {
          totalTokens: result.tokensUsed,
          completionReason: 'fallback',
          model: result.model
        }
      } as any;
      yield { type: 'done', data: null };
    } catch (fallbackError) {
      yield { type: 'error', data: fallbackError as Error };
    }
  }
}
```

## Implementation Timeline

### Phase 1: Core Streaming Enhancement
1. ✅ Analyze current architecture
2. 🔄 Create enhanced streaming types
3. 🔄 Implement generic streaming event handler
4. 🔄 Implement proper OpenAI streaming with LangChain

### Phase 2: Event System Enhancement
5. ⏳ Add ResponseCompletedEvent handling
6. ⏳ Enhance vLLM streaming to use generic event system
7. ⏳ Add provider-specific streaming configuration

### Phase 3: Integration and Testing
8. ⏳ Ensure LLM_STREAMING environment variable controls all providers
9. ⏳ Test OpenAI streaming functionality
10. ⏳ Test vLLM streaming with enhanced events
11. ⏳ Verify completion handling stays intact
12. ⏳ Add comprehensive error handling and fallback mechanisms

## Key Design Principles

1. **Backwards Compatibility**: Existing `StreamingSynthesisResponse` interface maintained
2. **Master Switch**: `LLM_STREAMING` environment variable controls all providers
3. **Provider Extensibility**: New providers can easily plug into the generic streaming system
4. **Completion Handling**: `ResponseCompletedEvent` emitted after streaming completes
5. **Error Resilience**: Fallback to non-streaming if streaming fails
6. **Performance**: Minimal overhead for non-streaming paths

## Testing Strategy

### OpenAI Streaming Tests
- Verify proper chunk emission during streaming
- Test completion event generation
- Validate fallback to non-streaming on errors
- Ensure token counting accuracy

### vLLM Streaming Tests
- Confirm existing functionality preserved
- Test enhanced event handling
- Verify completion event integration

### Integration Tests
- End-to-end `/ask` route testing with streaming
- Environment variable control verification
- Cross-provider consistency testing

## Success Criteria

1. ✅ OpenAI requests stream properly instead of falling back to non-streaming
2. ✅ `ResponseCompletedEvent` is emitted after all streaming completes
3. ✅ Generic event system supports multiple LLM providers
4. ✅ Provider-specific events can be handled (OpenAI vs vLLM)
5. ✅ `LLM_STREAMING` environment variable controls all providers
6. ✅ Current completion handling logic remains intact
7. ✅ Backwards compatibility maintained for existing clients
8. ✅ Comprehensive error handling and fallback mechanisms in place

This implementation plan addresses all requirements while maintaining backwards compatibility and providing a robust foundation for future LLM provider integrations.