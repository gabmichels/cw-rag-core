import { NextRequest, NextResponse } from 'next/server';
import { IngestRecord } from '../../../../types';

// Mock data for demonstration - in production this would query the audit log
const mockIngestRecords: IngestRecord[] = [
  {
    id: '1',
    time: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    docId: 'demo-sample-doc-1-1732196400-abc123',
    source: 'manual',
    action: 'publish',
    version: '1.0',
    redactionSummary: [
      { type: 'email', count: 2 },
      { type: 'phone', count: 1 }
    ],
    status: 'success',
    tenant: 'demo',
    filename: 'sample-document.md'
  },
  {
    id: '2',
    time: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
    docId: 'demo-privacy-policy-1732195800-def456',
    source: 'upload',
    action: 'block',
    version: '1.0',
    redactionSummary: [
      { type: 'ssn', count: 5 },
      { type: 'credit_card', count: 3 }
    ],
    status: 'blocked',
    tenant: 'demo',
    filename: 'privacy-policy.pdf'
  },
  {
    id: '3',
    time: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
    docId: 'demo-user-guide-1732194600-ghi789',
    source: 'api',
    action: 'publish',
    version: '2.1',
    redactionSummary: [],
    status: 'success',
    tenant: 'demo',
    filename: 'user-guide.html'
  },
  {
    id: '4',
    time: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    docId: 'demo-old-doc-1732191000-jkl012',
    source: 'upload',
    action: 'tombstone',
    version: '1.0',
    redactionSummary: [],
    status: 'success',
    tenant: 'demo',
    filename: 'old-document.txt'
  },
  {
    id: '5',
    time: new Date(Date.now() - 1000 * 60 * 90).toISOString(), // 1.5 hours ago
    docId: 'demo-failed-doc-1732189800-mno345',
    source: 'upload',
    action: 'publish',
    version: '1.0',
    redactionSummary: [],
    status: 'error',
    tenant: 'demo',
    filename: 'corrupted-file.pdf',
    error: 'Failed to parse PDF content'
  }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const action = searchParams.get('action');
    const source = searchParams.get('source');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Filter records
    let filteredRecords = [...mockIngestRecords];

    if (action) {
      filteredRecords = filteredRecords.filter(record => record.action === action);
    }

    if (source) {
      filteredRecords = filteredRecords.filter(record => record.source === source);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filteredRecords = filteredRecords.filter(record => new Date(record.time) >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      filteredRecords = filteredRecords.filter(record => new Date(record.time) <= toDate);
    }

    // Sort by time (newest first)
    filteredRecords.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    return NextResponse.json({
      records: paginatedRecords,
      pagination: {
        page,
        limit,
        total: filteredRecords.length,
        totalPages: Math.ceil(filteredRecords.length / limit),
        hasNext: endIndex < filteredRecords.length,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error in ingests API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch ingests' },
      { status: 500 }
    );
  }
}