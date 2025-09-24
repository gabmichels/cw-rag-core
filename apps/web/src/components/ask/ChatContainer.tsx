"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Added useRouter
import { cn } from '@/lib/utils';
import { AskRequest } from '@cw-rag-core/shared';
import { streamAskRequest, StreamingCallbacks, CitationMap } from '@/utils/streaming-api'; // Added CitationMap
import MessageBubble, { Citation } from './MessageBubble'; // Import Citation
import InputContainer from './InputContainer';
import DocumentViewerModal from './DocumentViewerModal'; // Import the new modal component

interface Message {
  id: string;
  type: 'user' | 'ai' | 'loading' | 'error';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  citations?: Citation[]; // Change to Citation[]
  confidence?: number;
  metrics?: any;
  freshnessStats?: any;
  error?: string;
}

interface ChatContainerProps {
  className?: string;
  placeholder?: string;
  welcomeMessage?: string;
}

export default function ChatContainer({
  className,
  placeholder = "Ask a question about your documents...",
}: ChatContainerProps) {
  const router = useRouter(); // Initialize router
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingClient, setStreamingClient] = useState<{ abort: () => void } | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false); // State for modal visibility
  const [modalQdrantDocId, setModalQdrantDocId] = useState<string | null>(null); // State for docId to open in modal
  const [modalHighlightId, setModalHighlightId] = useState<string | null>(null); // State for chunkId to highlight
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  };

  const removeMessage = (id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  const handleSubmit = async (query: string, docId?: string) => {
    if (isStreaming) {
      streamingClient?.abort();
      setIsStreaming(false);
    }

    // Add user message
    addMessage({
      type: 'user',
      content: query,
    });

    // Add loading message
    const loadingId = addMessage({
      type: 'loading',
      content: '',
    });

    setIsStreaming(true);

    // Prepare the request
    const askRequest: AskRequest = {
      query,
      userContext: {
        id: 'anonymous',
        tenantId: 'zenithfall',
        groupIds: ['public'],
      },
      k: 10,
      ...(docId && { docId }),
      includeMetrics: true,
    };

    // Set up streaming callbacks
    const callbacks: StreamingCallbacks = {
      onConnectionOpen: (data) => {
        console.log('Streaming connection opened:', data);
        // Replace loading message with AI message
        removeMessage(loadingId);
        addMessage({
          type: 'ai',
          content: '',
          isStreaming: true,
        });
      },

      onChunk: (text, accumulated) => {
        // Update the last AI message with new content
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.type === 'ai') {
            return prev.map((msg, index) =>
              index === prev.length - 1
                ? { ...msg, content: accumulated, isStreaming: true }
                : msg
            );
          }
          return prev;
        });
      },

      onCitations: (citationsMap: { [key: string]: Citation }) => { // Type as CitationMap
        console.log('Citations received (onCitations callback):', citationsMap);
        const citationsArray = Object.values(citationsMap); // Convert object to array
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.type === 'ai') {
            const updatedMessages = prev.map((msg, index) =>
              index === prev.length - 1
                ? { ...msg, citations: citationsArray }
                : msg
            );
            console.log('Messages after onCitations update:', updatedMessages);
            return updatedMessages;
          }
          return prev;
        });
      },

      onMetadata: (metadata) => {
        console.log('Metadata received:', metadata);
        // Update the last AI message with metadata
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.type === 'ai') {
            return prev.map((msg, index) =>
              index === prev.length - 1
                ? { ...msg, freshnessStats: metadata.freshnessStats }
                : msg
            );
          }
          return prev;
        });
      },

      onResponseCompleted: (response) => {
        console.log('Response completed:', response);

        if (response.isIDontKnow) {
          // Handle "I don't know" response
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.type === 'ai') {
              return prev.map((msg, index) =>
                index === prev.length - 1
                  ? {
                      ...msg,
                      content: response.answer,
                      isStreaming: false,
                      confidence: response.guardrailDecision?.confidence,
                    }
                  : msg
              );
            }
            return prev;
          });
        } else {
          // Update the last AI message with final data
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.type === 'ai') {
              const updatedMessages = prev.map((msg, index) =>
                index === prev.length - 1
                  ? {
                      ...msg,
                      isStreaming: false,
                      citations: response.citations || [],
                      confidence: response.guardrailDecision?.confidence,
                      metrics: response.metrics,
                      freshnessStats: response.freshnessStats,
                    }
                  : msg
              );
              console.log('Messages after onResponseCompleted update:', updatedMessages);
              return updatedMessages;
            }
            return prev;
          });
        }
      },

      onError: (error) => {
        console.error('Streaming error:', error);
        // Replace loading/streaming message with error
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.type === 'ai' || lastMessage?.type === 'loading') {
            return prev.map((msg, index) =>
              index === prev.length - 1
                ? {
                    ...msg,
                    type: 'error' as const,
                    content: '',
                    error,
                    isStreaming: false,
                  }
                : msg
            );
          }
          return prev;
        });
        setIsStreaming(false);
        setStreamingClient(null);
      },

      onDone: (data) => {
        console.log('Streaming done:', data);
        setIsStreaming(false);
        setStreamingClient(null);
      },
    };

    try {
      // Start streaming
      const client = streamAskRequest(askRequest, callbacks);
      setStreamingClient(client);
    } catch (error) {
      console.error('Failed to start streaming:', error);
      removeMessage(loadingId);
      addMessage({
        type: 'error',
        content: '',
        error: error instanceof Error ? error.message : 'Failed to start streaming',
      });
      setIsStreaming(false);
    }
  };

  const handleCloseDocumentModal = () => {
    setShowDocumentModal(false);
    setModalQdrantDocId(null);
    setModalHighlightId(null);
  };

  const handleCitationClick = (qdrantDocId: string, chunkId: string) => { // Updated parameter name for clarity
    console.log('Citation clicked - qdrantDocId:', qdrantDocId, 'chunkId:', chunkId);
    setModalQdrantDocId(qdrantDocId);
    setModalHighlightId(chunkId);
    setShowDocumentModal(true); // Open the modal
  };

  return (
    <div className={cn("flex flex-col h-full", className)} ref={containerRef}>
      {/* Document Viewer Modal */}
      {showDocumentModal && (
        <DocumentViewerModal
          isOpen={showDocumentModal}
          onClose={handleCloseDocumentModal}
          qdrantDocId={modalQdrantDocId}
          highlightId={modalHighlightId}
        />
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="max-w-md space-y-4">
              <div className="text-4xl">🤖</div>
              <h2 className="text-xl font-medium text-foreground">
                Ready to help!
              </h2>
              <p className="text-muted-foreground">
                Ask me anything about your documents. I'll search through them and provide you with accurate answers along with citations.
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            type={message.type}
            content={message.content}
            isStreaming={message.isStreaming}
            citations={message.citations}
            confidence={message.confidence}
            metrics={message.metrics}
            freshnessStats={message.freshnessStats}
            error={message.error}
            onCitationClick={handleCitationClick}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0">
        <InputContainer
          onSubmit={handleSubmit}
          isLoading={isStreaming}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}