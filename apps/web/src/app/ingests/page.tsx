"use client";

import { useState, useEffect } from 'react';
import { IngestRecord } from '../../types';

interface IngestResponse {
  records: IngestRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface Filters {
  action: string;
  source: string;
  dateFrom: string;
  dateTo: string;
}

export default function IngestsPage() {
  const [records, setRecords] = useState<IngestRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [filters, setFilters] = useState<Filters>({
    action: '',
    source: '',
    dateFrom: '',
    dateTo: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'docId' | 'source' | 'action'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchRecords = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.source && { source: filters.source }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo })
      });

      const response = await fetch(`/api/ingest/ingests?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch ingests');
      }

      const data: IngestResponse = await response.json();
      setRecords(data.records);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ingests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchRecords(1);
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      source: '',
      dateFrom: '',
      dateTo: ''
    });
    // Auto-apply after clearing
    setTimeout(() => fetchRecords(1), 0);
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }

    // Sort records locally for better UX
    const sortedRecords = [...records].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (column) {
        case 'time':
          aVal = new Date(a.time).getTime();
          bVal = new Date(b.time).getTime();
          break;
        case 'docId':
          aVal = a.docId;
          bVal = b.docId;
          break;
        case 'source':
          aVal = a.source;
          bVal = b.source;
          break;
        case 'action':
          aVal = a.action;
          bVal = b.action;
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    setRecords(sortedRecords);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded text-xs font-medium";
    switch (status) {
      case 'success':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'blocked':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getActionBadge = (action: string) => {
    const baseClasses = "px-2 py-1 rounded text-xs font-medium";
    switch (action) {
      case 'publish':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'block':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'skip':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'tombstone':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Recent Ingests</h1>
        <p className="text-gray-600">
          View and monitor document ingestion activity across all sources.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h2 className="text-lg font-medium mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Action</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">All Actions</option>
              <option value="publish">Publish</option>
              <option value="block">Block</option>
              <option value="skip">Skip</option>
              <option value="tombstone">Tombstone</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Source</label>
            <select
              value={filters.source}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">All Sources</option>
              <option value="manual">Manual</option>
              <option value="upload">Upload</option>
              <option value="api">API</option>
              <option value="automation">Automation</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date From</label>
            <input
              type="datetime-local"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date To</label>
            <input
              type="datetime-local"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={applyFilters}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Apply Filters
          </button>
          <button
            onClick={clearFilters}
            disabled={loading}
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{pagination.total}</div>
          <div className="text-sm text-gray-600">Total Records</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-green-600">
            {records.filter(r => r.status === 'success').length}
          </div>
          <div className="text-sm text-gray-600">Successful</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-red-600">
            {records.filter(r => r.status === 'error' || r.status === 'blocked').length}
          </div>
          <div className="text-sm text-gray-600">Failed/Blocked</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-purple-600">
            {records.filter(r => r.action === 'publish').length}
          </div>
          <div className="text-sm text-gray-600">Published</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('time')}
                >
                  Time {getSortIcon('time')}
                </th>
                <th
                  className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('docId')}
                >
                  Document ID {getSortIcon('docId')}
                </th>
                <th
                  className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('source')}
                >
                  Source {getSortIcon('source')}
                </th>
                <th
                  className="text-left p-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('action')}
                >
                  Action {getSortIcon('action')}
                </th>
                <th className="text-left p-4 font-medium text-gray-900">Version</th>
                <th className="text-left p-4 font-medium text-gray-900">PII Summary</th>
                <th className="text-left p-4 font-medium text-gray-900">Status</th>
                <th className="text-left p-4 font-medium text-gray-900">Filename</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    Loading ingests...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No ingests found matching the current filters.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-900">
                      {formatTime(record.time)}
                    </td>
                    <td className="p-4 text-sm text-gray-900 font-mono">
                      {record.docId}
                    </td>
                    <td className="p-4 text-sm text-gray-900">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                        {record.source}
                      </span>
                    </td>
                    <td className="p-4 text-sm">
                      <span className={getActionBadge(record.action)}>
                        {record.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-900">
                      {record.version}
                    </td>
                    <td className="p-4 text-sm">
                      {record.redactionSummary.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {record.redactionSummary.map((summary, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs"
                            >
                              {summary.type}: {summary.count}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </td>
                    <td className="p-4 text-sm">
                      <span className={getStatusBadge(record.status)}>
                        {record.status.toUpperCase()}
                      </span>
                      {record.error && (
                        <div className="text-xs text-red-600 mt-1">{record.error}</div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-900">
                      {record.filename || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing page {pagination.page} of {pagination.totalPages}
                ({pagination.total} total records)
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => fetchRecords(pagination.page - 1)}
                  disabled={!pagination.hasPrev || loading}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchRecords(pagination.page + 1)}
                  disabled={!pagination.hasNext || loading}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}