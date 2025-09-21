import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const INGEST_TOKEN = process.env.INGEST_TOKEN;

export async function POST(request: NextRequest) {
  if (!INGEST_TOKEN) {
    return NextResponse.json(
      { error: 'Configuration Error', message: 'Ingest token not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE_URL}/api/ingest/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-token': INGEST_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in preview proxy:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to preview documents' },
      { status: 500 }
    );
  }
}