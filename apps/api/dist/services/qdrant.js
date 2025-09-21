import * as crypto from 'crypto';
import { DOCUMENT_VECTOR_DIMENSION } from '@cw-rag-core/shared';
export { QdrantClient } from '@qdrant/js-client-rest'; // Explicitly export QdrantClient
export const QDRANT_COLLECTION_NAME = 'docs_v1';
export async function bootstrapQdrant(qdrantClient, logger, maxRetries = 5, retryDelay = 5000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            logger.info(`Attempt ${i + 1} to connect to Qdrant and bootstrap collection...`);
            const collections = await qdrantClient.getCollections();
            const collectionExists = collections.collections.some((c) => c.name === QDRANT_COLLECTION_NAME);
            if (!collectionExists) {
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' not found, creating...`);
                await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
                    vectors: { size: DOCUMENT_VECTOR_DIMENSION, distance: 'Cosine' },
                });
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' created.`);
                logger.info(`Creating payload indexes for '${QDRANT_COLLECTION_NAME}'...`);
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'tenant', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'docId', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'acl', field_schema: 'keyword', wait: true });
                await qdrantClient.createPayloadIndex(QDRANT_COLLECTION_NAME, { field_name: 'lang', field_schema: 'keyword', wait: true });
                logger.info('Payload indexes created successfully.');
            }
            else {
                logger.info(`Collection '${QDRANT_COLLECTION_NAME}' already exists.`);
            }
            logger.info('Qdrant bootstrap complete.');
            return;
        }
        catch (error) {
            logger.error(`Failed to connect to Qdrant or bootstrap collection: ${error.message}`);
            if (i < maxRetries - 1) {
                logger.info(`Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
            else {
                throw new Error('Max Qdrant connection retries reached. Exiting.');
            }
        }
    }
}
export function generateRandomVector(dimension) {
    return Array.from({ length: dimension }, () => Math.random());
}
export async function ingestDocument(qdrantClient, collectionName, document) {
    const docId = crypto.createHash('sha256').update(document.content).digest('hex');
    const vector = generateRandomVector(DOCUMENT_VECTOR_DIMENSION);
    const point = {
        id: docId,
        vector: vector,
        payload: {
            tenant: document.metadata.tenant,
            docId: docId,
            acl: document.metadata.acl,
            lang: document.metadata.lang,
            url: document.metadata.url,
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
export async function searchDocuments(qdrantClient, collectionName, request, userTenants, userAcl) {
    const vector = generateRandomVector(DOCUMENT_VECTOR_DIMENSION); // Placeholder vector for search
    const filter = {
        must: [
            {
                key: 'tenant',
                match: {
                    any: userTenants,
                },
            },
            {
                key: 'acl',
                match: {
                    any: userAcl,
                },
            },
        ],
    };
    const searchResult = await qdrantClient.search(collectionName, {
        vector: vector,
        limit: request.limit || 5, // Default limit
        filter: filter,
        with_payload: true,
    });
    return searchResult.map((hit) => ({
        id: hit.id,
        vector: hit.vector || [],
        payload: hit.payload || {}
    }));
}
