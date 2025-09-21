"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingServiceStub = void 0;
// Stub implementation for EmbeddingService
class EmbeddingServiceStub {
    async embed(text) {
        console.log(`Stub: Embedding text of length ${text.length}`);
        // Simulate async operation and return a mock vector
        await new Promise(resolve => setTimeout(resolve, 50));
        return Array.from({ length: 1536 }).map(() => Math.random()); // Common embedding dimension
    }
    async embedDocument(document) {
        console.log(`Stub: Embedding document with ID ${document.id}`);
        return this.embed(document.content);
    }
}
exports.EmbeddingServiceStub = EmbeddingServiceStub;
