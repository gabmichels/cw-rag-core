"use client";

import React from 'react';
import { RetrievedDocument } from '@cw-rag-core/shared';
import { calculateFreshnessInfoSafe } from '@cw-rag-core/shared';

interface RawChunksToggleProps {
  retrievedDocuments: RetrievedDocument[];
  show: boolean;
  onToggle: (show: boolean) => void;
}

function ChunkCard({
  document,
  index
}: {
  document: RetrievedDocument;
  index: number;
}) {
  const freshness = document.freshness || (
    document.document.metadata.modifiedAt
      ? calculateFreshnessInfoSafe(document.document.metadata.modifiedAt, document.document.metadata.tenantId)
      : null
  );

  const getFreshnessBadge = () => {
    if (!freshness) return null;

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
      </span>
    );
  };

  const getSearchTypeIcon = (searchType?: string) => {
    switch (searchType) {
      case 'hybrid':
        return '🔄';
      case 'vector_only':
        return '🎯';
      case 'keyword_only':
        return '🔍';
      default:
        return '📄';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    if (score >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white hover:shadow-sm transition-shadow">
      {/* Header with metadata */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-600 text-white text-xs font-bold rounded-full">
              {index + 1}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {document.document.metadata.filepath || document.document.id}
            </span>
            {getFreshnessBadge()}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getSearchTypeIcon(document.searchType)}</span>
            <span className={`text-sm font-mono ${getScoreColor(document.score)}`}>
              {(document.score * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Document metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          <div>
            <span className="font-medium">Doc ID:</span>
            <span className="ml-1 font-mono">{document.document.metadata.docId}</span>
          </div>
          {document.document.metadata.version && (
            <div>
              <span className="font-medium">Version:</span>
              <span className="ml-1">{document.document.metadata.version}</span>
            </div>
          )}
          {document.document.metadata.authors && document.document.metadata.authors.length > 0 && (
            <div className="md:col-span-2">
              <span className="font-medium">Authors:</span>
              <span className="ml-1">{document.document.metadata.authors.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Search scores breakdown */}
        {(document.vectorScore || document.keywordScore || document.fusionScore || document.rerankerScore) && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="text-xs text-gray-600">
              <span className="font-medium">Score breakdown:</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {document.vectorScore && (
                  <span>Vector: {(document.vectorScore * 100).toFixed(1)}%</span>
                )}
                {document.keywordScore && (
                  <span>Keyword: {(document.keywordScore * 100).toFixed(1)}%</span>
                )}
                {document.fusionScore && (
                  <span>Fusion: {(document.fusionScore * 100).toFixed(1)}%</span>
                )}
                {document.rerankerScore && (
                  <span>Reranker: {(document.rerankerScore * 100).toFixed(1)}%</span>
                )}
                {document.rank && (
                  <span>Rank: #{document.rank}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {document.document.content.length > 1000
            ? `${document.document.content.substring(0, 1000)}...`
            : document.document.content
          }
        </div>

        {document.document.content.length > 1000 && (
          <div className="mt-2 text-xs text-gray-500">
            Content truncated ({document.document.content.length} characters total)
          </div>
        )}
      </div>
    </div>
  );
}

export default function RawChunksToggle({
  retrievedDocuments,
  show,
  onToggle
}: RawChunksToggleProps) {
  if (!retrievedDocuments || retrievedDocuments.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Retrieved Chunks</h2>
          <p className="text-sm text-gray-600 mt-1">
            {retrievedDocuments.length} document{retrievedDocuments.length !== 1 ? 's' : ''} retrieved for this query
          </p>
        </div>

        <button
          onClick={() => onToggle(!show)}
          className={`
            flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all duration-200
            ${show
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }
          `}
        >
          <span>{show ? '👁️' : '👁️‍🗨️'}</span>
          <span className="text-sm font-medium">
            {show ? 'Hide chunks' : 'Show chunks'}
          </span>
        </button>
      </div>

      {/* Content */}
      {show && (
        <div className="p-4">
          {/* Summary Stats */}
          <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="font-medium">Total documents:</span>
                <span className="ml-2">{retrievedDocuments.length}</span>
              </div>
              <div>
                <span className="font-medium">Average score:</span>
                <span className="ml-2">
                  {(retrievedDocuments.reduce((sum, doc) => sum + doc.score, 0) / retrievedDocuments.length * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="font-medium">Search types:</span>
                <span className="ml-2">
                  {Array.from(new Set(retrievedDocuments.map(doc => doc.searchType || 'unknown'))).join(', ')}
                </span>
              </div>
            </div>
          </div>

          {/* Document List */}
          <div className="space-y-4">
            {retrievedDocuments.map((doc, index) => (
              <ChunkCard
                key={`${doc.document.id}-${index}`}
                document={doc}
                index={index}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}