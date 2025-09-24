"use client";

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import { processEmojis } from '@/utils/emoji';
import { MarkdownComponents } from './MarkdownComponents';
import { Citation } from './MessageBubble'; // Import Citation

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
  onStreamingComplete?: () => void;
  citations?: Citation[]; // Pass citations down for inline linking
  onCitationClick?: (qdrantDocId: string, chunkId: string) => void; // Pass click handler
}

export default function StreamingText({
  text,
  isStreaming,
  className,
  onStreamingComplete,
  citations = [], // Destructure new prop
  onCitationClick // Destructure new prop
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousTextRef = useRef('');

  useEffect(() => {
    // If text changed and we're streaming, animate the new portion
    if (text !== previousTextRef.current) {
      const previousLength = previousTextRef.current.length;
      const newText = text.slice(previousLength);

      if (newText && isStreaming) {
        // Animate the new chunk
        let currentIndex = displayedText.length;
        const targetLength = text.length;

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }

        intervalRef.current = setInterval(() => {
          if (currentIndex < targetLength) {
            setDisplayedText(text.slice(0, currentIndex + 1));
            currentIndex++;
          } else {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        }, 20); // Adjust speed here (20ms = 50 chars/second)
      } else if (!isStreaming) {
        // If not streaming, show text immediately
        setDisplayedText(text);
      }

      previousTextRef.current = text;
    }
  }, [text, isStreaming, displayedText.length]);

  useEffect(() => {
    // Manage cursor blinking
    if (isStreaming) {
      const cursorInterval = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 500);

      return () => clearInterval(cursorInterval);
    } else {
      setShowCursor(false);
      onStreamingComplete?.();
    }
  }, [isStreaming, onStreamingComplete]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Process emojis in the displayed text
  const processedText = processEmojis(displayedText);

  return (
    <div className={cn("relative", className)}>
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={
            {
              ...MarkdownComponents,
              // Pass citations and onCitationClick to the anchor component
              a: (props: any) => (
                <MarkdownComponents.a
                  {...props}
                  citations={citations}
                  onCitationClick={onCitationClick}
                />
              ),
              footnoteReference: (props: any) => {
                console.log('StreamingText: Custom `footnoteReference` receiving:', {
                  identifier: props.identifier,
                  label: props.label,
                  citationsCount: citations.length,
                  onCitationClickType: typeof onCitationClick // Log the type of the function
                });
                return (
                  <MarkdownComponents.footnoteReference
                    {...props}
                    citations={citations}
                    onCitationClick={onCitationClick}
                  />
                );
              },
            } as any // Use 'as any' to satisfy ReactMarkdown's generic component typing.
          }
          className="prose prose-invert max-w-none"
        >
          {processedText}
        </ReactMarkdown>
      </div>
      {isStreaming && (
        <span
          className={cn(
            "streaming-cursor ml-1 inline-block",
            showCursor ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}