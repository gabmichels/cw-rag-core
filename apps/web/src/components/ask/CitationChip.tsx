"use client";

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Citation {
  id: string;
  number: number;
  source: string;
  freshness?: {
    category: 'Fresh' | 'Recent' | 'Stale';
    badge: string;
    humanReadable: string;
    ageInDays: number;
  };
  docId?: string;
  version?: string;
  url?: string;
  filepath?: string;
  authors?: string[];
}

interface CitationChipProps {
  citation: Citation;
  onClick?: () => void;
  className?: string;
  showDetails?: boolean;
}

function getFreshnessColor(category: 'Fresh' | 'Recent' | 'Stale'): string {
  switch (category) {
    case 'Fresh':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'Recent':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'Stale':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-muted/20 text-muted-foreground border-border';
  }
}

export default function CitationChip({
  citation,
  onClick,
  className,
  showDetails = false
}: CitationChipProps) {
  const freshnessColor = citation.freshness
    ? getFreshnessColor(citation.freshness.category)
    : 'bg-muted/20 text-muted-foreground border-border';

  return (
    <button
      onClick={onClick}
      className={cn(
        "citation-chip",
        "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full",
        "border transition-all duration-200",
        "hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50",
        freshnessColor,
        className
      )}
      title={`Click to view source: ${citation.source}${citation.freshness ? ` (${citation.freshness.humanReadable})` : ''}`}
    >
      <span className="font-semibold">[{citation.number}]</span>

      <span className="truncate max-w-[120px]">
        {citation.source}
      </span>

      {citation.version && (
        <span className="opacity-75">
          v{citation.version}
        </span>
      )}

      {citation.freshness && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1 py-0 h-4 border-current",
            freshnessColor
          )}
        >
          {citation.freshness.badge}
        </Badge>
      )}

      {showDetails && citation.authors && citation.authors.length > 0 && (
        <span className="opacity-75 text-[10px]">
          by {citation.authors[0]}
          {citation.authors.length > 1 && ` +${citation.authors.length - 1}`}
        </span>
      )}
    </button>
  );
}