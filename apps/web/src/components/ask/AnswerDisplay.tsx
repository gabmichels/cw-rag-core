"use client";

import { useState } from 'react';
import { AskResponse } from '@cw-rag-core/shared';

interface AnswerDisplayProps {
  answer: string;
  citations?: AskResponse['citations'];
  queryId: string;
  guardrailDecision?: AskResponse['guardrailDecision'];
  onCitationClick?: (citationId: string) => void;
}

function getConfidenceLevel(confidence: number): { level: string; color: string; bgColor: string } {
  if (confidence >= 0.8) {
    return { level: 'High', color: 'text-green-700', bgColor: 'bg-green-100' };
  } else if (confidence >= 0.5) {
    return { level: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
  } else {
    return { level: 'Low', color: 'text-red-700', bgColor: 'bg-red-100' };
  }
}

function CitationChip({ citation, onClick }: {
  citation: NonNullable<AskResponse['citations']>[0];
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors cursor-pointer"
      title={`Click to view source: ${citation.source}`}
    >
      <span className="mr-1">[{citation.number}]</span>
      <span className="truncate max-w-[120px]">{citation.source}</span>
      {citation.version && (
        <span className="ml-1 text-blue-600">v{citation.version}</span>
      )}
    </button>
  );
}

export default function AnswerDisplay({
  answer,
  citations,
  queryId,
  guardrailDecision,
  onCitationClick
}: AnswerDisplayProps) {
  const [, setSelectedCitation] = useState<string | null>(null);

  // Parse citations from the answer text to replace [1], [2], etc. with clickable chips
  const renderAnswerWithCitations = (text: string) => {
    if (!citations || citations.length === 0) {
      return <div className="whitespace-pre-wrap">{text}</div>;
    }

    const citationRegex = /\[(\d+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </span>
        );
      }

      // Add citation chip
      const citationNumber = parseInt(match[1]);
      const citation = citations.find(c => c.number === citationNumber);

      if (citation) {
        parts.push(
          <CitationChip
            key={`citation-${citation.id}`}
            citation={citation}
            onClick={() => {
              setSelectedCitation(citation.id);
              onCitationClick?.(citation.id);
            }}
          />
        );
      } else {
        // Fallback for missing citation
        parts.push(
          <span key={`missing-${citationNumber}`} className="text-red-500">
            [{citationNumber}]
          </span>
        );
      }

      lastIndex = citationRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }

    return <div className="whitespace-pre-wrap leading-relaxed">{parts}</div>;
  };

  const confidence = guardrailDecision?.confidence ?? 0;
  const confidenceInfo = getConfidenceLevel(confidence);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header with confidence indicator */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Answer</h2>
        {guardrailDecision && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confidence:</span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${confidenceInfo.bgColor} ${confidenceInfo.color}`}>
              {confidenceInfo.level}
            </span>
            <span className="text-xs text-gray-500">
              ({Math.round(confidence * 100)}%)
            </span>
          </div>
        )}
      </div>

      {/* Answer content */}
      <div className="p-6">
        <div className="text-gray-800 text-base leading-relaxed">
          {renderAnswerWithCitations(answer)}
        </div>

        {/* Citations summary */}
        {citations && citations.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-sm font-medium text-gray-700">Citations:</span>
              <span className="text-xs text-gray-500">
                {citations.length} source{citations.length !== 1 ? 's' : ''} referenced
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation) => (
                <CitationChip
                  key={citation.id}
                  citation={citation}
                  onClick={() => {
                    setSelectedCitation(citation.id);
                    onCitationClick?.(citation.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Query ID for debugging */}
        <div className="mt-4 pt-4 border-t border-gray-50">
          <div className="text-xs text-gray-400 font-mono">
            Query ID: {queryId}
          </div>
        </div>
      </div>
    </div>
  );
}