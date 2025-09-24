import { AskRequest } from '@cw-rag-core/shared';

export interface StreamingEvent {
  type: 'connection_opened' | 'chunk' | 'citations' | 'metadata' | 'response_completed' | 'error' | 'done';
  data: any;
}

export interface StreamingCallbacks {
  onConnectionOpen?: (data: any) => void;
  onChunk?: (text: string, accumulated: string) => void;
  onCitations?: (citations: any[]) => void;
  onMetadata?: (metadata: any) => void;
  onResponseCompleted?: (response: any) => void;
  onError?: (error: string) => void;
  onDone?: (data: any) => void;
}

export class StreamingClient {
  private eventSource: EventSource | null = null;
  private abortController: AbortController | null = null;

  async streamAsk(
    request: AskRequest,
    callbacks: StreamingCallbacks,
    baseUrl: string = '/api'
  ): Promise<void> {
    // Cleanup any existing connections
    this.cleanup();

    try {
      this.abortController = new AbortController();

      // Create EventSource for Server-Sent Events
      const url = new URL(`${baseUrl}/ask/stream`, window.location.origin);

      // For EventSource, we need to send the request data via query params or POST it first
      // Since EventSource only supports GET, we'll use fetch with ReadableStream instead
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Parse the SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        let currentEvent: Partial<StreamingEvent> = {};

        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }

          // Process events using double newline as separator (standard SSE format)
          let eventDelimiterIndex;
          while ((eventDelimiterIndex = buffer.indexOf('\n\n')) !== -1) {
            const eventString = buffer.substring(0, eventDelimiterIndex);
            buffer = buffer.substring(eventDelimiterIndex + 2);

            const lines = eventString.split('\n');
            let eventType = '';
            let eventData = {};

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  eventData = JSON.parse(line.substring(6));
                } catch (e) {
                  console.warn('Failed to parse SSE data:', line);
                }
              }
            }

            if (eventType && Object.keys(eventData).length > 0) {
              console.log('Processing event:', eventType);
              this.handleEvent({ type: eventType as StreamingEvent['type'], data: eventData }, callbacks);
            }
          }

          if (done) {
            // Process any remaining complete event in buffer (without requiring \n\n at the end)
            if (buffer.trim()) {
              const lines = buffer.split('\n');
              let eventType = '';
              let eventData = {};

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  eventType = line.substring(7).trim();
                } else if (line.startsWith('data: ')) {
                  try {
                    eventData = JSON.parse(line.substring(6));
                  } catch (e) {
                    console.warn('Failed to parse final SSE data:', line);
                  }
                }
              }

              if (eventType && Object.keys(eventData).length > 0) {
                console.log('Processing final event without delimiter:', eventType);
                this.handleEvent({ type: eventType as StreamingEvent['type'], data: eventData }, callbacks);
              }
            }
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Streaming request was aborted');
        return;
      }

      console.error('Streaming error:', error);
      callbacks.onError?.(error instanceof Error ? error.message : 'Unknown streaming error');
    }
  }

  private handleEvent(event: StreamingEvent, callbacks: StreamingCallbacks): void {
    switch (event.type) {
      case 'connection_opened':
        callbacks.onConnectionOpen?.(event.data);
        break;

      case 'chunk':
        callbacks.onChunk?.(event.data.text, event.data.accumulated);
        break;

      case 'citations':
        callbacks.onCitations?.(event.data);
        break;

      case 'metadata':
        callbacks.onMetadata?.(event.data);
        break;

      case 'response_completed':
        callbacks.onResponseCompleted?.(event.data);
        break;

      case 'error':
        callbacks.onError?.(event.data.message || 'Unknown error');
        break;

      case 'done':
        callbacks.onDone?.(event.data);
        this.cleanup();
        break;

      default:
        console.warn('Unknown streaming event type:', event.type);
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.abortController) {
      this.abortController = null;
    }
  }
}

// Utility function for easier usage
export function streamAskRequest(
  request: AskRequest,
  callbacks: StreamingCallbacks,
  baseUrl?: string
): { client: StreamingClient; abort: () => void } {
  const client = new StreamingClient();

  client.streamAsk(request, callbacks, baseUrl).catch((error) => {
    callbacks.onError?.(error.message || 'Failed to start streaming');
  });

  return {
    client,
    abort: () => client.abort(),
  };
}