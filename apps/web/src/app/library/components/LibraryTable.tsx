"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, Trash2, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { calculateFreshnessInfo, type FreshnessInfo } from '@cw-rag-core/shared';

interface DocumentInfo {
  docId: string;
  space: string;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  freshness: FreshnessInfo;
}

type SortField = 'docId' | 'space' | 'createdAt' | 'updatedAt' | 'freshness';
type SortDirection = 'asc' | 'desc';

interface DeleteDialogProps {
  isOpen: boolean;
  docId: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteDialog({ isOpen, docId, onClose, onConfirm, isDeleting }: DeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Delete Document
        </h3>
        <p className="text-muted-foreground mb-4">
          Are you sure you want to delete all chunks for document "{docId}"? This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive-foreground"></div>
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FreshnessIndicator({ freshness }: { freshness: FreshnessInfo }) {
  const getColorClass = () => {
    switch (freshness.category) {
      case 'Fresh': return 'text-green-600 bg-green-50 border-green-200';
      case 'Recent': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Stale': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="flex flex-col items-start">
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getColorClass()}`}>
        {freshness.badge}
      </span>
      <span className="text-xs text-muted-foreground mt-1">
        {freshness.humanReadable}
      </span>
    </div>
  );
}

export default function LibraryTable() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; docId: string }>({ isOpen: false, docId: '' });
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Fetch documents
  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true);
        const response = await fetch('/api/documents');
        if (!response.ok) {
          throw new Error(`Failed to fetch documents: ${response.statusText}`);
        }
        const data = await response.json();
        setDocuments(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch documents');
      } finally {
        setLoading(false);
      }
    }

    fetchDocuments();
  }, []);

  // Filter and sort documents
  const filteredAndSortedDocuments = useMemo(() => {
    // Ensure documents is an array before calling filter
    const currentDocuments = documents ?? [];
    let filtered = currentDocuments.filter(doc =>
      doc.docId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'docId':
          aVal = a.docId.toLowerCase();
          bVal = b.docId.toLowerCase();
          break;
        case 'space':
          aVal = a.space.toLowerCase();
          bVal = b.space.toLowerCase();
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          aVal = new Date(a.updatedAt).getTime();
          bVal = new Date(b.updatedAt).getTime();
          break;
        case 'freshness':
          aVal = a.freshness.ageInDays;
          bVal = b.freshness.ageInDays;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [documents, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      setDeletingDocId(docId);
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }

      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.docId !== docId));
      setDeleteDialog({ isOpen: false, docId: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeletingDocId(null);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronUp className="h-4 w-4 opacity-0 group-hover:opacity-50" />;
    }
    return sortDirection === 'asc' ?
      <ChevronUp className="h-4 w-4 opacity-70" /> :
      <ChevronDown className="h-4 w-4 opacity-70" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {/* Documents Count */}
      <div className="text-sm text-muted-foreground">
        {filteredAndSortedDocuments.length} document{filteredAndSortedDocuments.length !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-4">
                <button
                  onClick={() => handleSort('docId')}
                  className="group flex items-center space-x-1 font-medium text-foreground hover:text-primary"
                >
                  <span>Document ID</span>
                  <SortIcon field="docId" />
                </button>
              </th>
              <th className="text-left p-4">
                <button
                  onClick={() => handleSort('space')}
                  className="group flex items-center space-x-1 font-medium text-foreground hover:text-primary"
                >
                  <span>Space</span>
                  <SortIcon field="space" />
                </button>
              </th>
              <th className="text-left p-4">
                <button
                  onClick={() => handleSort('createdAt')}
                  className="group flex items-center space-x-1 font-medium text-foreground hover:text-primary"
                >
                  <span>Created At</span>
                  <SortIcon field="createdAt" />
                </button>
              </th>
              <th className="text-left p-4">
                <button
                  onClick={() => handleSort('updatedAt')}
                  className="group flex items-center space-x-1 font-medium text-foreground hover:text-primary"
                >
                  <span>Updated At</span>
                  <SortIcon field="updatedAt" />
                </button>
              </th>
              <th className="text-left p-4">
                <button
                  onClick={() => handleSort('freshness')}
                  className="group flex items-center space-x-1 font-medium text-foreground hover:text-primary"
                >
                  <span>Freshness</span>
                  <SortIcon field="freshness" />
                </button>
              </th>
              <th className="text-left p-4">
                <span className="font-medium text-foreground">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAndSortedDocuments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {searchQuery ? 'No documents match your search.' : 'No documents found.'}
                </td>
              </tr>
            ) : (
              filteredAndSortedDocuments.map((doc) => (
                <tr key={doc.docId} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4">
                    <Link
                      href={`/view-document/${doc.docId}`}
                      className="text-primary hover:text-primary/80 font-medium flex items-center space-x-1 group"
                    >
                      <span>{doc.docId}</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity" />
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1">
                      {doc.chunkCount} chunks
                    </div>
                  </td>
                  <td className="p-4">
                    <input
                      type="text"
                      value={doc.space}
                      onChange={(e) => {
                        // TODO: Implement space update
                        console.log('Update space for', doc.docId, 'to', e.target.value);
                      }}
                      className="w-full px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Space"
                    />
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) || doc.createdAt}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {new Date(doc.updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) || doc.updatedAt}
                  </td>
                  <td className="p-4">
                    <FreshnessIndicator freshness={doc.freshness} />
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setDeleteDialog({ isOpen: true, docId: doc.docId })}
                      disabled={deletingDocId === doc.docId}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Dialog */}
      <DeleteDialog
        isOpen={deleteDialog.isOpen}
        docId={deleteDialog.docId}
        onClose={() => setDeleteDialog({ isOpen: false, docId: '' })}
        onConfirm={() => handleDelete(deleteDialog.docId)}
        isDeleting={deletingDocId === deleteDialog.docId}
      />
    </div>
  );
}