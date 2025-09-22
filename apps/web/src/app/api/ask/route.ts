import { NextRequest, NextResponse } from 'next/server';
import { AskRequest, AskResponse } from '@cw-rag-core/shared';

export async function POST(request: NextRequest) {
  try {
    const askRequest: AskRequest = await request.json();

    // Validate the request
    if (!askRequest.query || !askRequest.query.trim()) {
      return NextResponse.json(
        { error: 'Query is required', message: 'Please provide a valid question' },
        { status: 400 }
      );
    }

    if (!askRequest.userContext) {
      return NextResponse.json(
        { error: 'User context is required', message: 'User context must be provided' },
        { status: 400 }
      );
    }

    // Get the API base URL from environment
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

    // Forward the request to the backend API
    const response = await fetch(`${apiBaseUrl}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(askRequest),
    });

    if (!response.ok) {
      let errorMessage = `API returned ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // If we can't parse the error response, use the default message
      }

      return NextResponse.json(
        {
          error: 'API_ERROR',
          message: errorMessage
        },
        { status: response.status }
      );
    }

    const askResponse: AskResponse = await response.json();

    return NextResponse.json(askResponse);

  } catch (error) {
    console.error('Ask API error:', error);

    // Handle different types of errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        {
          error: 'CONNECTION_ERROR',
          message: 'Unable to connect to the backend API. Please try again later.'
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while processing your request.'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are supported for the ask endpoint.'
    },
    { status: 405 }
  );
}