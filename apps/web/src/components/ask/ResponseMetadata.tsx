"use client";

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CitationChip from './CitationChip';
import { ChevronDown, ChevronUp, Clock, Zap, Shield, BarChart3 } from 'lucide-react';

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
  docId: string; // Human-readable ID
  qdrantDocId: string; // Internal Qdrant document ID (content hash)
  version?: string;
  url?: string;
  filepath?: string;
  authors?: string[];
}

interface ResponseMetadataProps {
  citations: Citation[];
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
  onCitationClick?: (docId: string, chunkId: string) => void;
  className?: string;
}

function getConfidenceLevel(confidence: number): { level: string; color: string; bgColor: string } {
  if (confidence >= 0.8) {
    return { level: 'High', color: 'text-green-400', bgColor: 'bg-green-500/20 border-green-500/30' };
  } else if (confidence >= 0.5) {
    return { level: 'Medium', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20 border-yellow-500/30' };
  } else {
    return { level: 'Low', color: 'text-red-400', bgColor: 'bg-red-500/20 border-red-500/30' };
  }
}

export default function ResponseMetadata({
  citations,
  confidence,
  metrics,
  freshnessStats,
  onCitationClick,
  className
}: ResponseMetadataProps) {
  const [showMetrics, setShowMetrics] = useState(false);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);

  const confidenceInfo = confidence ? getConfidenceLevel(confidence) : null;

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitationId(citation.id);
    if (citation.qdrantDocId && citation.id) { // Use qdrantDocId for navigation
      onCitationClick?.(citation.qdrantDocId, citation.id);
    } else {
      console.warn('Missing qdrantDocId or citation.id for clickable citation:', citation);
    }
  };

  if (!citations.length && !confidence && !metrics && !freshnessStats) {
    return null;
  }

  return (
    <div className={cn("space-y-4 animate-fade-in", className)}>
      {/* Citations */}
      {citations.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Shield className="w-4 h-4 text-primary" />
              Sources ({citations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation) => (
                <CitationChip
                  key={citation.id}
                  citation={citation}
                  onClick={() => handleCitationClick(citation)}
                  className={
                    selectedCitationId === citation.id
                      ? "ring-2 ring-primary/50"
                      : ""
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confidence & Freshness */}
      {(confidence !== undefined || freshnessStats) && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Confidence */}
              {confidence !== undefined && confidenceInfo && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Confidence
                  </span>
                  <Badge className={cn("border", confidenceInfo.bgColor, confidenceInfo.color)}>
                    {confidenceInfo.level} ({Math.round(confidence * 100)}%)
                  </Badge>
                </div>
              )}

              {/* Freshness */}
              {freshnessStats && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Freshness
                  </span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-green-400 border-green-500/30">
                      {Math.round(freshnessStats.freshPercentage)}% Fresh
                    </Badge>
                    <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
                      {Math.round(freshnessStats.recentPercentage)}% Recent
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics (Collapsible) */}
      {metrics && (
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-muted/10 transition-colors"
            onClick={() => setShowMetrics(!showMetrics)}
          >
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Performance Metrics
              </span>
              {showMetrics ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </CardTitle>
          </CardHeader>

          {showMetrics && (
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <span className="text-muted-foreground">Total Time</span>
                  <div className="font-medium">{Math.round(metrics.totalDuration)}ms</div>
                </div>

                {metrics.vectorSearchDuration && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Vector Search</span>
                    <div className="font-medium">{Math.round(metrics.vectorSearchDuration)}ms</div>
                  </div>
                )}

                {metrics.keywordSearchDuration && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Keyword Search</span>
                    <div className="font-medium">{Math.round(metrics.keywordSearchDuration)}ms</div>
                  </div>
                )}

                {metrics.fusionDuration && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Fusion</span>
                    <div className="font-medium">{Math.round(metrics.fusionDuration)}ms</div>
                  </div>
                )}

                {metrics.rerankerDuration && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Reranking</span>
                    <div className="font-medium">{Math.round(metrics.rerankerDuration)}ms</div>
                  </div>
                )}

                {metrics.synthesisTime && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">LLM Synthesis</span>
                    <div className="font-medium">{Math.round(metrics.synthesisTime)}ms</div>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}