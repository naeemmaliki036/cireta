import { NextRequest, NextResponse } from 'next/server';

/**
 * API proxy route handler.
 *
 * Routes requests to backend services:
 * - /api/example-api/users -> EXAMPLE_API_URL/users
 *
 * This pattern allows:
 * - Centralizing API calls through Next.js
 * - Adding authentication headers
 * - Avoiding CORS issues in development
 */

const SERVICE_URLS: Record<string, string | undefined> = {
  'example-api': process.env.EXAMPLE_API_URL || 'http://localhost:8000',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; path: string[] }> }
) {
  return handleRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; path: string[] }> }
) {
  return handleRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; path: string[] }> }
) {
  return handleRequest(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; path: string[] }> }
) {
  return handleRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; path: string[] }> }
) {
  return handleRequest(request, await params);
}

async function handleRequest(
  request: NextRequest,
  params: { service: string; path: string[] }
) {
  const { service, path } = params;

  const baseUrl = SERVICE_URLS[service];
  if (!baseUrl) {
    return NextResponse.json(
      { error: `Unknown service: ${service}` },
      { status: 404 }
    );
  }

  const targetPath = path.join('/');
  const url = new URL(targetPath, baseUrl);

  // Forward query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Prepare headers
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip host header to avoid conflicts
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      // @ts-expect-error - duplex is required for streaming body
      duplex: 'half',
    });

    // Forward the response
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to reach backend service' },
      { status: 502 }
    );
  }
}
