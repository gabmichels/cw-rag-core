"use client";

import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
  showPulse?: boolean;
}

export default function LoadingSkeleton({
  className,
  lines = 3,
  showPulse = true
}: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            "loading-skeleton h-4 rounded",
            showPulse && "animate-pulse-soft",
            i === lines - 1 && "w-3/4", // Last line shorter
            i === 0 && "w-full",
            i > 0 && i < lines - 1 && "w-5/6"
          )}
        />
      ))}

      {showPulse && (
        <div className="flex items-center space-x-2 mt-4">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm text-muted-foreground">AI is thinking...</span>
        </div>
      )}
    </div>
  );
}