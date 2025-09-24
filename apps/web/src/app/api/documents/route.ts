import { NextRequest, NextResponse } from 'next/server';

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
    return NextResponse.json(data);

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