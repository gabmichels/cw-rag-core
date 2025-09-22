"use client";

import { useEffect, useRef } from 'react';
import { AskResponse, RetrievedDocument } from '@cw-rag-core/shared';
import { calculateFreshnessInfoSafe } from '@cw-rag-core/shared';

interface CitationsListProps {
  citations: AskResponse['citations'];
  retrievedDocuments: RetrievedDocument[];
  selectedCitationId?: string;
}

function FreshnessBadge({ freshness }: { freshness?: ReturnType<typeof calculateFreshnessInfoSafe> }) {
  if (!freshness) {
    return null;
  }

  const getBadgeStyle = (category: string) => {
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

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getBadgeStyle(freshness.category)}`}>
      {freshness.badge}
      <span className="ml-1">({freshness.humanReadable})</span>
    </span>
  );
}

function CitationCard({
  citation,
  document,
  isSelected
}: {
  citation: NonNullable<AskResponse['citations']>[0];
  document?: RetrievedDocument;
  isSelected: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [isSelected]);

  const freshness = citation.freshness || (
    document?.document.metadata.modifiedAt
      ? calculateFreshnessInfoSafe(document.document.metadata.modifiedAt, document.document.metadata.tenantId)
      : null
  );

  return (
    <div
      ref={cardRef}
      id={`citation-${citation.id}`}
      className={`border rounded-lg p-4 transition-all duration-200 ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Citation header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full">
            {citation.number}
          </span>
          <h3 className="font-medium text-gray-900 truncate">{citation.source}</h3>
        </div>
        <FreshnessBadge freshness={freshness} />
      </div>

      {/* Citation metadata */}
      <div className="space-y-2 text-sm text-gray-600">
        {citation.docId && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">Document ID:</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {citation.docId}
            </span>
          </div>
        )}

        {citation.version && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">Version:</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {citation.version}
            </span>
          </div>
        )}

        {citation.authors && citation.authors.length > 0 && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">Authors:</span>
            <span>{citation.authors.join(', ')}</span>
          </div>
        )}

        {citation.url && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">URL:</span>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline truncate"
            >
              {citation.url}
            </a>
          </div>
        )}

        {citation.filepath && (
          <div className="flex items-center space-x-2">
            <span className="font-medium">File:</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded truncate">
              {citation.filepath}
            </span>
          </div>
        )}
      </div>

      {/* Document content snippet if available */}
      {document?.document.content && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded border-l-4 border-blue-400">
            <div className="font-medium text-gray-800 mb-1">Content excerpt:</div>
            <div className="line-clamp-3">
              {document.document.content.substring(0, 300)}
              {document.document.content.length > 300 && '...'}
            </div>
          </div>
        </div>
      )}

      {/* Retrieval score if available */}
      {document?.score && (
        <div className="mt-2 text-xs text-gray-500">
          Relevance score: {(document.score * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function CitationsList({
  citations,
  retrievedDocuments,
  selectedCitationId
}: CitationsListProps & { selectedCitationId?: string }) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
        <p className="text-sm text-gray-600 mt-1">
          Click on citation numbers in the answer above to highlight sources below
        </p>
      </div>

      <div className="p-4 space-y-4">
        {citations.map((citation) => {
          const document = retrievedDocuments.find(doc =>
            doc.document.id === citation.docId
          );

          return (
            <CitationCard
              key={citation.id}
              citation={citation}
              document={document}
              isSelected={selectedCitationId === citation.id}
            />
          );
        })}
      </div>
    </div>
  );
}