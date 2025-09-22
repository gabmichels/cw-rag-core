"use client";

import { useState } from 'react';

interface Citation {
  id: string;
  number: number;
  source: string;
  freshness?: {
    category: 'Fresh' | 'Recent' | 'Stale';
    badge: string;
    ageInDays: number;
    humanReadable: string;
    timestamp: string;
  };
}

interface AnswerDisplayProps {
  answer: string;
  citations?: Citation[];
  queryId: string;
}

export default function AnswerDisplay({ answer, citations, queryId }: AnswerDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Simple markdown renderer for basic formatting
  const renderFormattedText = (text: string) => {
    // Replace citation patterns like [^1] with styled links
    const citationPattern = /\[\^(\d+)\]/g;
    const parts = text.split(citationPattern);

    const elements = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Regular text - apply basic markdown formatting
        let formatted = parts[i];

        // Bold text
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');

        // Italic text
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

        // Code spans
        formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

        // Line breaks
        formatted = formatted.replace(/\n\n/g, '</p><p>');
        formatted = formatted.replace(/\n/g, '<br/>');

        elements.push(
          <span key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      } else {
        // Citation number
        const citationNumber = parseInt(parts[i]);
        const citation = citations?.find(c => c.number === citationNumber);

        elements.push(
          <a
            key={i}
            href={`#citation-${citationNumber}`}
            className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 transition-colors duration-200 no-underline"
            title={citation ? `Source: ${citation.source}` : `Citation ${citationNumber}`}
          >
            {citationNumber}
          </a>
        );
      }
    }

    return elements;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <span className="text-green-600">✅</span>
          <h2 className="text-lg font-semibold text-gray-900">Answer</h2>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
            ID: {queryId.substring(0, 8)}...
          </span>
        </div>

        <button
          onClick={handleCopyToClipboard}
          className={`
            px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
            flex items-center space-x-1.5
            ${copied
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
            }
          `}
          title="Copy answer to clipboard"
        >
          {copied ? (
            <>
              <span>✅</span>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Answer Content */}
      <div className="p-6">
        <div className="prose prose-gray max-w-none text-gray-800 leading-relaxed">
          <p>{renderFormattedText(answer)}</p>
        </div>

        {/* Citation count */}
        {citations && citations.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>📚</span>
              <span>
                Based on {citations.length} source{citations.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}