"use client";

import { useState } from 'react';
import { RetrievedDocument } from '@cw-rag-core/shared';

interface RawChunksToggleProps {
  retrievedDocuments: RetrievedDocument[];
  show: boolean;
  onToggle: (show: boolean) => void;
}

export default function RawChunksToggle({ retrievedDocuments, show, onToggle }: RawChunksToggleProps) {
  if (!retrievedDocuments || retrievedDocuments.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Toggle Header */}
      <button
        onClick={() => onToggle(!show)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors duration-200"
      >
        <div className="flex items-center space-x-2">
          <span>🔍</span>
          <h3 className="text-lg font-semibold text-gray-900">
            Raw Retrieved Documents ({retrievedDocuments.length})
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">
            Debug & Transparency
          </span>
          <span className="text-gray-400">
            {show ? '🔼' : '🔽'}
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {show && (
        <div className="border-t border-gray-200">
          <div className="p-4 bg-gray-50">
            <p className="text-sm text-gray-600 mb-4">
              These are the raw documents retrieved from the vector search and reranking pipeline.
              This view helps understand how the answer was constructed and debug retrieval quality.
            </p>

            {/* Retrieval Pipeline Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-medium text-gray-700">Hybrid Search</div>
                <div className="text-gray-600">Vector + Keyword</div>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-medium text-gray-700">Reranking</div>
                <div className="text-gray-600">Cross-encoder scoring</div>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <div className="font-medium text-gray-700">Documents</div>
                <div className="text-gray-600">{retrievedDocuments.length} retrieved</div>
              </div>
            </div>
          </div>

          {/* Documents List */}
          <div className="divide-y divide-gray-200">
            {retrievedDocuments.map((doc, index) => (
              <div key={doc.document.id} className="p-4">
                {/* Document Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Document ID: {doc.document.id}
                      </h4>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <span>Score: {doc.score.toFixed(6)}</span>
                        <span>Tenant: {doc.document.metadata.tenantId}</span>
                        {doc.freshness && (
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {doc.freshness.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Metadata */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <h5 className="text-xs font-medium text-gray-700 mb-2">Metadata:</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="font-medium text-gray-600">Doc ID:</span>
                      <div className="text-gray-800 font-mono text-xs break-all">
                        {doc.document.metadata.docId}
                      </div>
                    </div>
                    {doc.document.metadata.version && (
                      <div>
                        <span className="font-medium text-gray-600">Version:</span>
                        <div className="text-gray-800">{doc.document.metadata.version}</div>
                      </div>
                    )}
                    {doc.document.metadata.lang && (
                      <div>
                        <span className="font-medium text-gray-600">Language:</span>
                        <div className="text-gray-800">{doc.document.metadata.lang}</div>
                      </div>
                    )}
                    {doc.document.metadata.authors && (
                      <div>
                        <span className="font-medium text-gray-600">Authors:</span>
                        <div className="text-gray-800">{doc.document.metadata.authors.join(', ')}</div>
                      </div>
                    )}
                  </div>

                  {/* ACL */}
                  <div className="mt-2">
                    <span className="font-medium text-gray-600 text-xs">ACL:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {doc.document.metadata.acl.map((permission, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Document Content */}
                <div className="bg-blue-50 rounded-lg p-3">
                  <h5 className="text-xs font-medium text-gray-700 mb-2">Content:</h5>
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                    {doc.document.content}
                  </pre>
                  <div className="mt-2 text-xs text-gray-500">
                    Length: {doc.document.content.length} characters
                  </div>
                </div>

                {/* Freshness Details */}
                {doc.freshness && (
                  <div className="mt-3 bg-yellow-50 rounded-lg p-3">
                    <h5 className="text-xs font-medium text-gray-700 mb-2">Freshness Analysis:</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="font-medium text-gray-600">Category:</span>
                        <div className="text-gray-800">{doc.freshness.category}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Age:</span>
                        <div className="text-gray-800">{doc.freshness.ageInDays} days</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Readable:</span>
                        <div className="text-gray-800">{doc.freshness.humanReadable}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Timestamp:</span>
                        <div className="text-gray-800 font-mono">{doc.freshness.timestamp}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}