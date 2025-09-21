"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantClientStub = void 0;
// Stub implementation for QdrantClient
class QdrantClientStub {
    async upsertVectors(collectionName, vectors) {
        console.log(`Stub: Upserting ${vectors.length} vectors into collection ${collectionName}`);
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    async searchVectors(collectionName, queryVector, limit, filter) {
        console.log(`Stub: Searching collection ${collectionName} with query vector (first 5 elements): [${queryVector.slice(0, 5).join(', ')}...]`);
        // Simulate async operation and return mock results
        await new Promise(resolve => setTimeout(resolve, 100));
        return Array.from({ length: limit }).map((_, i) => ({
            id: `mock-vector-${i}`,
            vector: Array.from({ length: queryVector.length }).map(() => Math.random()),
            payload: { docId: `mock-doc-${i}`, tenantId: 'mock-tenant' },
            score: Math.random(),
        }));
    }
}
exports.QdrantClientStub = QdrantClientStub;
