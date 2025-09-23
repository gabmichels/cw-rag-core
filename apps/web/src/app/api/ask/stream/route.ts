import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward the request to the backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/ask/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Backend API responded with ${response.status}`);
    }

    // Return the streaming response
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('Streaming proxy error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to connect to streaming API',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}