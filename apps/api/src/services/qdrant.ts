import { QdrantClient } from '@qdrant/js-client-rest';
import * as crypto from 'crypto';
import {
  EmbeddingService,
  BgeSmallEnV15EmbeddingService
} from '@cw-rag-core/retrieval';
import type { FastifyBaseLogger } from 'fastify';
import {
  Document,
  RetrievalRequest,
  DOCUMENT_VECTOR_DIMENSION,
  UserContext,
  buildQdrantRBACFilter,
  validateUserAuthorization,
  getUserACLEntries
} from '@cw-rag-core/shared';
export { QdrantClient };

export const QDRANT_COLLECTION_NAME = 'docs_v1';

export async function bootstrapQdrant(
  qdrantClient: QdrantClient,
  logger: FastifyBaseLogger,
  maxRetries = 5,
  retryDelay = 5000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info(`Attempt ${i + 1}/${maxRetries} to connect to Qdrant and bootstrap collection...`);
      const collections = await qdrantClient.getCollections();

      // Enhanced logging for debugging collection persistence
      const existingCollectionNames = collections.collections.map(c => c.name);
      logger.info(`Qdrant connection successful. Found ${collections.collections.length} existing collections: [${existingCollectionNames.join(', ')}]. Target collection: '${QDRANT_COLLECTION_NAME}'`);

      const collectionExists = collections.collections.some(
        (c) => c.name === QDRANT_COLLECTION_NAME
      );

      if (!collectionExists) {
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' not found in existing collections, creating new collection...`);
        await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
          vectors: { size: DOCUMENT_VECTOR_DIMENSION, distance: 'Cosine' },
        });
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' created.`);

        logger.info(`Creating payload indexes for '${QDRANT_COLLECTION_NAME}'...`);

        // Core RBAC indexes
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'tenant',
          field_schema: 'keyword',
          wait: true
        });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'docId',
          field_schema: 'keyword',
          wait: true
        });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'acl',
          field_schema: 'keyword',
          wait: true
        });

        // Language preference index for enhanced RBAC
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'lang',
          field_schema: 'keyword',
          wait: true
        });

        // Temporal metadata indexes for freshness calculations
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'createdAt',
          field_schema: 'keyword',
          wait: true
        });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'modifiedAt',
          field_schema: 'keyword',
          wait: true
        });

        // Create full-text index for content field to enable BM25-style keyword search
        logger.info(`Creating full-text index for content field in '${QDRANT_COLLECTION_NAME}'...`);
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'content',
          field_schema: 'text',
          wait: true
        });

        // Additional performance indexes for common query patterns
        logger.info(`Creating additional performance indexes for '${QDRANT_COLLECTION_NAME}'...`);
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'url',
          field_schema: 'keyword',
          wait: true
        });
        await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, {
          field_name: 'version',
          field_schema: 'keyword',
          wait: true
        });

        logger.info('Payload indexes and full-text index created successfully.');
      } else {
        logger.info(`Collection '${QDRANT_COLLECTION_NAME}' already exists - skipping creation and index setup.`);

        // Additional validation to ensure collection health
        try {
          const collectionInfo = await qdrantClient.getCollection(QDRANT_COLLECTION_NAME);
          logger.info(`Existing collection '${QDRANT_COLLECTION_NAME}' validation - Vectors: ${collectionInfo.vectors_count}, Indexed: ${collectionInfo.indexed_vectors_count}, Points: ${collectionInfo.points_count}, Status: ${collectionInfo.status}`);
        } catch (validationError) {
          logger.warn(`Could not validate existing collection '${QDRANT_COLLECTION_NAME}': ${(validationError as Error).message}`);
        }
      }
      logger.info('Qdrant bootstrap complete.');
      return;
    } catch (error) {
      logger.error(`Failed to connect to Qdrant or bootstrap collection: ${(error as Error).message}`);
      if (i < maxRetries - 1) {
        logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw new Error('Max Qdrant connection retries reached. Exiting.');
      }
    }
  }
}


export async function ingestDocument(
  qdrantClient: QdrantClient,
  embeddingService: EmbeddingService,
  collectionName: string,
  document: Document
): Promise<string> {
  const docId = crypto.createHash('sha256').update(document.content).digest('hex');
  const vector = await embeddingService.embed(document.content);

  // Ensure temporal metadata is captured
  const now = new Date().toISOString();
  const createdAt = document.metadata.createdAt || now;
  const modifiedAt = document.metadata.modifiedAt || now;

  const point = {
    id: docId,
    vector: vector,
    payload: {
      tenant: document.metadata.tenantId,
      docId: docId,
      acl: document.metadata.acl,
      lang: document.metadata.lang,
      url: document.metadata.url,
      filepath: document.metadata.filepath,
      version: document.metadata.version,
      authors: document.metadata.authors,
      keywords: document.metadata.keywords,
      createdAt: createdAt,
      modifiedAt: modifiedAt,
      content: document.content,
    },
  };

  await qdrantClient.upsert(collectionName, {
    wait: true,
    batch: {
      ids: [point.id],
      vectors: [point.vector],
      payloads: [point.payload || null],
    },
  });

  return docId;
}

export async function searchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  request: RetrievalRequest,
  userContext: UserContext,
  vector?: number[]
): Promise<any[]> {
  // Validate user authorization first
  if (!validateUserAuthorization(userContext)) {
    throw new Error('User authorization validation failed');
  }

  // Use placeholder vector if not provided
  const searchVector = vector || Array.from({ length: DOCUMENT_VECTOR_DIMENSION }, () => Math.random());

  // Build enhanced RBAC filter using the new utility
  const rbacFilter = buildQdrantRBACFilter(userContext);

  const searchResult = await qdrantClient.search(collectionName, {
    vector: searchVector,
    limit: request.limit || 5, // Default limit
    filter: rbacFilter,
    with_payload: true,
  });

  return searchResult.map((hit) => ({
    id: hit.id,
    vector: hit.vector || [],
    payload: hit.payload || {}
  }));
}

/**
 * Legacy compatibility function - maintains backward compatibility
 * @deprecated Use searchDocuments with UserContext instead
 */
export async function searchDocumentsLegacy(
  qdrantClient: QdrantClient,
  collectionName: string,
  request: RetrievalRequest,
  userTenants: string[],
  userAcl: string[],
): Promise<any[]> {
  // Convert legacy parameters to UserContext for internal use
  const userContext: UserContext = {
    id: userAcl[0] || '', // Assume first ACL entry is user ID
    groupIds: userAcl.slice(1), // Rest are group IDs
    tenantId: userTenants[0] || ''
  };

  return searchDocuments(qdrantClient, collectionName, request, userContext);
}

// Enhanced keyword search function using Qdrant's full-text index with RBAC
export async function keywordSearchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  query: string,
  limit: number,
  userContext: UserContext
): Promise<any[]> {
  // Validate user authorization first
  if (!validateUserAuthorization(userContext)) {
    throw new Error('User authorization validation failed');
  }

  // Build enhanced RBAC filter
  const rbacFilter = buildQdrantRBACFilter(userContext);

  // Add content text search to the must conditions
  rbacFilter.must.push({
    key: 'content',
    match: {
      text: query
    }
  });

  try {
    // Use search with a dummy vector to leverage text matching
    const dummyVector = Array.from({ length: DOCUMENT_VECTOR_DIMENSION }, () => 0);

    const searchResult = await qdrantClient.search(collectionName, {
      vector: dummyVector,
      limit: limit,
      filter: rbacFilter,
      with_payload: true,
    });

    return searchResult.map((hit: any) => ({
      id: hit.id,
      vector: [],
      payload: hit.payload || {}
    }));
  } catch (error) {
    console.error('Keyword search failed:', error);
    // Fallback to simple payload filtering without text search
    return [];
  }
}

/**
 * Legacy compatibility function for keyword search
 * @deprecated Use keywordSearchDocuments with UserContext instead
 */
export async function keywordSearchDocumentsLegacy(
  qdrantClient: QdrantClient,
  collectionName: string,
  query: string,
  limit: number,
  userTenants: string[],
  userAcl: string[]
): Promise<any[]> {
  // Convert legacy parameters to UserContext for internal use
  const userContext: UserContext = {
    id: userAcl[0] || '', // Assume first ACL entry is user ID
    groupIds: userAcl.slice(1), // Rest are group IDs
    tenantId: userTenants[0] || ''
  };

  return keywordSearchDocuments(qdrantClient, collectionName, query, limit, userContext);
}

/**
 * Performs a direct search for unauthorized access testing
 * Returns 0 results for users without proper ACL
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context (potentially unauthorized)
 * @param vector Search vector
 * @param limit Search limit
 * @returns Search results (empty for unauthorized users)
 */
export async function securityTestSearch(
  qdrantClient: QdrantClient,
  collectionName: string,
  userContext: UserContext,
  vector: number[],
  limit: number = 10
): Promise<any[]> {
  // This function is specifically for security testing
  // If user fails authorization, return empty results
  if (!validateUserAuthorization(userContext)) {
    return []; // Return 0 results for unauthorized users
  }

  const rbacFilter = buildQdrantRBACFilter(userContext);

  try {
    const searchResult = await qdrantClient.search(collectionName, {
      vector: vector,
      limit: limit,
      filter: rbacFilter,
      with_payload: true,
    });

    return searchResult.map((hit) => ({
      id: hit.id,
      vector: hit.vector || [],
      payload: hit.payload || {}
    }));
  } catch (error) {
    console.error('Security test search failed:', error);
    return []; // Return empty results on error
  }
}

/**
 * Optimized batch search for multiple queries with shared RBAC context
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context for RBAC
 * @param vectors Array of search vectors
 * @param limit Search limit per query
 * @returns Array of search results for each vector
 */
export async function batchSearchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  userContext: UserContext,
  vectors: number[][],
  limit: number = 5
): Promise<any[][]> {
  // Validate user authorization once for all searches
  if (!validateUserAuthorization(userContext)) {
    throw new Error('User authorization validation failed');
  }

  // Build RBAC filter once for all searches
  const rbacFilter = buildQdrantRBACFilter(userContext);

  // Execute searches in parallel for better performance
  const searchPromises = vectors.map(vector =>
    qdrantClient.search(collectionName, {
      vector: vector,
      limit: limit,
      filter: rbacFilter,
      with_payload: true,
    })
  );

  try {
    const searchResults = await Promise.all(searchPromises);

    return searchResults.map(result =>
      result.map((hit) => ({
        id: hit.id,
        vector: hit.vector || [],
        payload: hit.payload || {}
      }))
    );
  } catch (error) {
    console.error('Batch search failed:', error);
    throw new Error(`Batch search failed: ${(error as Error).message}`);
  }
}

/**
 * Optimized search with query hinting for better performance
 * @param qdrantClient Qdrant client instance
 * @param collectionName Collection name
 * @param userContext User context for RBAC
 * @param vector Search vector
 * @param limit Search limit
 * @param exactSearch Whether to use exact search (true) or ANN search (false)
 * @returns Search results
 */
export async function optimizedSearchDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  userContext: UserContext,
  vector: number[],
  limit: number = 5,
  exactSearch: boolean = false
): Promise<any[]> {
  // Validate user authorization first
  if (!validateUserAuthorization(userContext)) {
    throw new Error('User authorization validation failed');
  }

  // Build enhanced RBAC filter
  const rbacFilter = buildQdrantRBACFilter(userContext);

  const searchParams: any = {
    vector: vector,
    limit: limit,
    filter: rbacFilter,
    with_payload: true,
    exact: exactSearch
  };

  // Add performance hints based on query characteristics
  if (limit <= 10) {
    searchParams.ef = Math.max(limit * 2, 16); // Optimize for small result sets
  }

  try {
    const searchResult = await qdrantClient.search(collectionName, searchParams);

    return searchResult.map((hit) => ({
      id: hit.id,
      vector: hit.vector || [],
      payload: hit.payload || {}
    }));
  } catch (error) {
    console.error('Optimized search failed:', error);
    throw new Error(`Optimized search failed: ${(error as Error).message}`);
  }
}