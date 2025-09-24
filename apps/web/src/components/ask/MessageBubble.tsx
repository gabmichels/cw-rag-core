"use client";

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import StreamingText from './StreamingText';
import ResponseMetadata from './ResponseMetadata';
import LoadingSkeleton from './LoadingSkeleton';
import { Bot, User, AlertCircle } from 'lucide-react';

export interface Citation {
  id: string;
  number: number;
  source: string;
  freshness?: {
    category: 'Fresh' | 'Recent' | 'Stale';
    badge: string;
    humanReadable: string;
    ageInDays: number;
  };
  docId: string; // This is the human-readable doc ID (e.g. "Skill Tables")
  qdrantDocId: string; // This is the actual Qdrant document content hash ID
  version?: string;
  url?: string;
  filepath?: string;
  authors?: string[];
}

interface MessageBubbleProps {
  type: 'user' | 'ai' | 'loading' | 'error';
  content?: string;
  isStreaming?: boolean;
  citations?: Citation[];
  confidence?: number;
  metrics?: {
    totalDuration: number;
    vectorSearchDuration?: number;
    keywordSearchDuration?: number;
    fusionDuration?: number;
    rerankerDuration?: number;
    guardrailDuration?: number;
    synthesisTime?: number;
  };
  freshnessStats?: {
    totalDocuments: number;
    freshPercentage: number;
    recentPercentage: number;
    stalePercentage: number;
    avgAgeInDays: number;
  };
  error?: string;
  onCitationClick?: (docId: string, chunkId: string) => void;
  className?: string;
}

export default function MessageBubble({
  type,
  content = '',
  isStreaming = false,
  citations = [],
  confidence,
  metrics,
  freshnessStats,
  error,
  onCitationClick,
  className
}: MessageBubbleProps) {
  const [showMetadata, setShowMetadata] = useState(false);

  useEffect(() => {
    // Show metadata when streaming completes
    if (!isStreaming && (citations.length > 0 || confidence !== undefined || metrics)) {
      const timer = setTimeout(() => setShowMetadata(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, citations.length, confidence, metrics]);

  const renderIcon = () => {
    switch (type) {
      case 'user':
        return <User className="w-5 h-5 text-primary" />;
      case 'ai':
        return <Bot className="w-5 h-5 text-primary" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Bot className="w-5 h-5 text-primary animate-pulse" />;
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'loading':
        return <LoadingSkeleton lines={3} />;

      case 'error':
        return (
          <div className="text-destructive">
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm opacity-80 mt-1">{error || 'An unexpected error occurred'}</p>
          </div>
        );

      case 'user':
        return (
          <div className="whitespace-pre-wrap leading-relaxed">
            {content}
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <StreamingText
              text={content}
              isStreaming={isStreaming}
              className="leading-relaxed"
              onStreamingComplete={() => setShowMetadata(true)}
              citations={citations} // Pass citations down
              onCitationClick={onCitationClick} // Pass click handler down
            />

            {showMetadata && !isStreaming && (
              <ResponseMetadata
                citations={citations}
                confidence={confidence}
                metrics={metrics}
                freshnessStats={freshnessStats}
                onCitationClick={onCitationClick}
                className="animate-fade-in"
              />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn(
      "flex gap-3 max-w-[90%] animate-fade-in",
      type === 'user' ? "ml-auto flex-row-reverse" : "mr-auto",
      className
    )}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        type === 'user'
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border"
      )}>
        {renderIcon()}
      </div>

      {/* Message Content */}
      <Card className={cn(
        "message-bubble",
        type === 'user'
          ? "message-bubble-user"
          : "message-bubble-ai",
        type === 'error' && "border-destructive/50 bg-destructive/5"
      )}>
        <div className="p-4">
          {renderContent()}
        </div>
      </Card>
    </div>
  );
}