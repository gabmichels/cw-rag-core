"use client";

import { useState } from 'react';
import { RetrievedDocument } from '@cw-rag-core/shared';

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

interface CitationsListProps {
  citations: Citation[];
  retrievedDocuments: RetrievedDocument[];
}

export default function CitationsList({ citations, retrievedDocuments }: CitationsListProps) {
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());

  const toggleCitation = (citationId: string) => {
    const newExpanded = new Set(expandedCitations);
    if (newExpanded.has(citationId)) {
      newExpanded.delete(citationId);
    } else {
      newExpanded.add(citationId);
    }
    setExpandedCitations(newExpanded);
  };

  const getDocumentForCitation = (citation: Citation) => {
    return retrievedDocuments.find(doc => doc.document.id === citation.id);
  };

  const getFreshnessBadgeStyle = (category: 'Fresh' | 'Recent' | 'Stale') => {
    switch (category) {
      case 'Fresh':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Recent':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Stale':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
          <span>📚</span>
          <span>Citations ({citations.length})</span>
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Sources used to generate this answer
        </p>
      </div>

      {/* Citations List */}
      <div className="divide-y divide-gray-200">
        {citations.map((citation) => {
          const document = getDocumentForCitation(citation);
          const isExpanded = expandedCitations.has(citation.id);

          return (
            <div key={citation.id} id={`citation-${citation.number}`} className="p-4">
              {/* Citation Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    {/* Citation Number */}
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-semibold">
                      {citation.number}
                    </div>

                    {/* Source Info */}
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                        {citation.source}
                      </h4>

                      {/* Freshness Badge */}
                      {citation.freshness && (
                        <div className="mt-1 flex items-center space-x-2">
                          <span
                            className={`
                              inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border
                              ${getFreshnessBadgeStyle(citation.freshness.category)}
                            `}
                          >
                            {citation.freshness.badge}
                          </span>
                          <span className="text-xs text-gray-500">
                            {citation.freshness.humanReadable}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expand/Collapse Button */}
                <button
                  onClick={() => toggleCitation(citation.id)}
                  className="ml-4 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors duration-200"
                >
                  {isExpanded ? '🔼 Less' : '🔽 More'}
                </button>
              </div>

              {/* Expanded Content */}
              {isExpanded && document && (
                <div className="mt-4 pl-11 space-y-3">
                  {/* Document Metadata */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="font-medium text-gray-700">Document ID:</span>
                        <span className="ml-1 text-gray-600 font-mono">{document.document.id}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Score:</span>
                        <span className="ml-1 text-gray-600">{document.score.toFixed(4)}</span>
                      </div>
                      {Boolean(document.document.metadata?.type) && (
                        <div>
                          <span className="font-medium text-gray-700">Type:</span>
                          <span className="ml-1 text-gray-600">{document.document.metadata.type as string}</span>
                        </div>
                      )}
                      {Boolean(document.document.metadata?.wordCount) && (
                        <div>
                          <span className="font-medium text-gray-700">Word Count:</span>
                          <span className="ml-1 text-gray-600">{document.document.metadata.wordCount as string}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Document Content Preview */}
                  <div className="bg-blue-50 rounded-lg p-3">
                    <h5 className="text-xs font-medium text-gray-700 mb-2">Content Preview:</h5>
                    <p className="text-sm text-gray-800 line-clamp-4 leading-relaxed">
                      {document.document.content.substring(0, 500)}
                      {document.document.content.length > 500 && '...'}
                    </p>
                  </div>

                  {/* Source Link */}
                  {Boolean(document.document.metadata?.source) && (
                    <div>
                      <a
                        href={document.document.metadata.source as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 underline"
                      >
                        <span>🔗</span>
                        <span>View Original Source</span>
                        <span>↗</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}