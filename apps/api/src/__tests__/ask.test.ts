import Fastify, { FastifyInstance } from 'fastify';
import { askRoute } from '../routes/ask.js';
import { AskRequest, AskResponse, UserContext, Document, DocumentMetadata, RetrievedDocument } from '@cw-rag-core/shared';
import { QdrantClient } from '@qdrant/js-client-rest'; // Import QdrantClient from the actual module, not stub

// Mocking QdrantClient and searchDocuments function
const mockSearchDocuments = jest.fn();
const mockQdrantClient = {
  search: mockSearchDocuments,
} as unknown as QdrantClient; // Cast to bypass strict type checking for mock

describe('Ask Endpoint - /ask', () => {
  const server = Fastify();
  server.register(askRoute, { qdrantClient: mockQdrantClient, collectionName: 'test_collection' });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    mockSearchDocuments.mockClear();
  });

  test('should return a valid AskResponse structure for /ask', async () => {
    const mockUserContext: UserContext = {
      id: 'user1',
      tenantId: 'tenant1',
      groupIds: ['groupA'],
    };

    const mockAskRequest: AskRequest = {
      query: 'What is the capital of France?',
      userContext: mockUserContext,
      k: 2,
    };

    const mockDocumentMetadata: DocumentMetadata = {
      tenantId: 'tenant1',
      docId: 'doc1',
      lang: 'en',
      acl: ['user1', 'groupA'],
      url: 'http://example.com/doc1',
      filepath: 'path/to/doc1.txt',
      version: '1.0',
      authors: ['Author A'],
      keywords: ['keyword1', 'keyword2'],
    };

    const mockDocument: Document = {
      id: 'doc1',
      content: 'Paris is the capital of France.',
      metadata: mockDocumentMetadata,
    };

    const mockRetrievedDocument: RetrievedDocument = {
      document: mockDocument,
      score: 0.95,
    };

    mockSearchDocuments.mockResolvedValueOnce([
      {
        id: 'doc1',
        score: 0.95,
        payload: {
          content: 'Paris is the capital of France.',
          tenant: 'tenant1',
          docId: 'doc1',
          acl: ['user1', 'groupA'],
          lang: 'en',
          url: 'http://example.com/doc1',
          filepath: 'path/to/doc1.txt',
          version: '1.0',
          authors: ['Author A'],
          keywords: ['keyword1', 'keyword2'],
        },
      },
    ]);

    const response = await server.inject({
      method: 'POST',
      url: '/ask',
      payload: mockAskRequest,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.statusCode).toBe(200);
    const responseBody: AskResponse = response.json();

    expect(responseBody).toHaveProperty('answer');
    expect(typeof responseBody.answer).toBe('string');
    expect(responseBody.answer).toContain('Phase-0 stub answer');

    expect(responseBody).toHaveProperty('retrievedDocuments');
    expect(Array.isArray(responseBody.retrievedDocuments)).toBe(true);
    expect(responseBody.retrievedDocuments.length).toBe(1);
    expect(responseBody.retrievedDocuments[0]).toEqual(mockRetrievedDocument);

    expect(responseBody).toHaveProperty('queryId');
    expect(typeof responseBody.queryId).toBe('string');

    expect(mockSearchDocuments).toHaveBeenCalledTimes(1);
    expect(mockSearchDocuments).toHaveBeenCalledWith(
        mockQdrantClient,
        'test_collection',
        expect.objectContaining({ query: 'What is the capital of France?' }),
        ['tenant1'],
        ['user1', 'groupA']
    );
  });
});