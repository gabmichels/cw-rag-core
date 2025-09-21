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
    // Get the form data from the request
    const formData = await request.formData();

    // Create a new FormData object to forward to the backend
    const backendFormData = new FormData();

    // Copy all form fields to the backend request
    formData.forEach((value, key) => {
      backendFormData.append(key, value);
    });

    const response = await fetch(`${API_BASE_URL}/api/ingest/upload`, {
      method: 'POST',
      headers: {
        'x-ingest-token': INGEST_TOKEN,
        // Don't set Content-Type header for FormData - let fetch handle it
      },
      body: backendFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in upload proxy:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to upload files' },
      { status: 500 }
    );
  }
}