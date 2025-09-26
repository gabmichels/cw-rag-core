import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering to prevent build-time caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    // Forward the request to the backend API to get all documents
    const backendUrl = `${API_BASE_URL}/documents`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: response.statusText || 'Failed to fetch documents',
          message: 'Could not retrieve document list.'
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Ensure data is an array, default to empty array if not
    const documents = Array.isArray(data) ? data : [];
    return NextResponse.json(documents);

  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to retrieve document list.'
      },
      { status: 500 }
    );
  }
}