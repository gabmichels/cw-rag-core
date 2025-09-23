"use client";

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
  onStreamingComplete?: () => void;
}

export default function StreamingText({
  text,
  isStreaming,
  className,
  onStreamingComplete
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

  return (
    <div className={cn("relative", className)}>
      <span className="whitespace-pre-wrap leading-relaxed">
        {displayedText}
      </span>
      {isStreaming && (
        <span
          className={cn(
            "streaming-cursor ml-1",
            showCursor ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}