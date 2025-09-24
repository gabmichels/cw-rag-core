import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  try {
    const { docId } = params;

    // Decode the docId to handle URL encoding (e.g., "Death%20Rules" -> "Death Rules")
    const decodedDocId = decodeURIComponent(docId);

    // Forward the request to the backend API
    const backendUrl = `${API_BASE_URL}/documents/${encodeURIComponent(decodedDocId)}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: response.statusText || 'Document not found',
          message: `Document with ID "${decodedDocId}" not found or could not be retrieved.`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to retrieve document content.'
      },
      { status: 500 }
    );
  }
}