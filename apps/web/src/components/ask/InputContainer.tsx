"use client";

import { useState, useRef, KeyboardEvent, FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, FileText, X, Loader2 } from 'lucide-react';

interface InputContainerProps {
  onSubmit: (query: string, docId?: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export default function InputContainer({
  onSubmit,
  isLoading = false,
  placeholder = "Ask a question about your documents...",
  className
}: InputContainerProps) {
  const [query, setQuery] = useState('');
  const [docId, setDocId] = useState('');
  const [showDocIdInput, setShowDocIdInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSubmit(query.trim(), docId.trim() || undefined);
      setQuery('');
      // Keep docId for consecutive queries
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const clearDocId = () => {
    setDocId('');
    setShowDocIdInput(false);
  };

  return (
    <div className={cn("input-container", className)}>
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <div className="p-4 space-y-3">
          {/* Document ID Input (Collapsible) */}
          {showDocIdInput && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Filter by document ID (optional)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDocId}
                  className="ml-auto h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <Input
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="e.g., my-specific-document-id"
                className="mt-2 bg-background/50"
              />
            </div>
          )}

          {/* Main Input Area */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={query}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={isLoading}
                  className={cn(
                    "min-h-[50px] max-h-[120px] resize-none",
                    "bg-background/50 border-border/50",
                    "focus:bg-background focus:border-primary/50",
                    "transition-all duration-200",
                    "pr-12" // Space for document ID button
                  )}
                  rows={1}
                />

                {/* Document ID Toggle Button */}
                {!showDocIdInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDocIdInput(true)}
                    className="absolute right-2 top-2 h-6 w-6 p-0 hover:bg-muted/50"
                    title="Filter by document ID"
                  >
                    <FileText className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Send Button */}
              <Button
                type="submit"
                disabled={!query.trim() || isLoading}
                className={cn(
                  "h-auto min-h-[50px] px-4",
                  "bg-primary hover:bg-primary/90",
                  "transition-all duration-200",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Helper Text */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Press Enter to send, Shift+Enter for new line
              </span>
              {query.length > 0 && (
                <span>
                  {query.length} characters
                </span>
              )}
            </div>
          </form>

          {/* Active Filters */}
          {docId && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Filtering by:</span>
              <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs">
                <FileText className="w-3 h-3" />
                {docId}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDocId}
                  className="h-4 w-4 p-0 ml-1 hover:bg-primary/20"
                >
                  <X className="w-2 h-2" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}