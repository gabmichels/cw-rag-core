export class QdrantKeywordSearchService {
    qdrantClient;
    constructor(qdrantClient) {
        this.qdrantClient = qdrantClient;
    }
    async search(collectionName, query, limit, filter) {
        try {
            // Use Qdrant's scroll with text filter for BM25-style keyword search
            // This leverages the full-text index on the content field
            const searchFilter = {
                must: [
                    {
                        key: 'content',
                        match: {
                            text: query
                        }
                    }
                ]
            };
            // Add additional filters if provided
            if (filter && Object.keys(filter).length > 0) {
                searchFilter.must.push(...this.buildFilterConditions(filter));
            }
            const scrollResult = await this.qdrantClient.scroll(collectionName, {
                filter: searchFilter,
                limit: limit,
                with_payload: true,
                with_vector: false // We don't need vectors for keyword search
            });
            return scrollResult.points.map((point) => ({
                id: point.id.toString(),
                score: this.calculateBM25Score(query, point.payload?.content || ''),
                payload: point.payload || {},
                content: point.payload?.content || ''
            }))
                .sort((a, b) => b.score - a.score) // Sort by BM25 score descending
                .slice(0, limit);
        }
        catch (error) {
            console.error('Keyword search failed:', error);
            throw new Error(`Keyword search failed: ${error.message}`);
        }
    }
    buildFilterConditions(filter) {
        const conditions = [];
        for (const [key, value] of Object.entries(filter)) {
            if (Array.isArray(value)) {
                conditions.push({
                    key,
                    match: { any: value }
                });
            }
            else {
                conditions.push({
                    key,
                    match: { value }
                });
            }
        }
        return conditions;
    }
    calculateBM25Score(query, content) {
        // Simple BM25-inspired scoring implementation
        // In a production system, you'd want to use Qdrant's built-in BM25 scoring
        const k1 = 1.2;
        const b = 0.75;
        const avgDocLength = 1000; // Average document length assumption
        const queryTerms = query.toLowerCase().split(/\s+/);
        const contentLower = content.toLowerCase();
        const docLength = content.length;
        let score = 0;
        for (const term of queryTerms) {
            const tf = (contentLower.match(new RegExp(term, 'g')) || []).length;
            if (tf > 0) {
                const normalizedTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
                // Simplified IDF calculation (in real BM25, this would use document frequency)
                const idf = Math.log(1 + 1 / (tf + 1));
                score += normalizedTf * idf;
            }
        }
        return score;
    }
}
// Alternative implementation using Qdrant's discover API for semantic keyword search
export class QdrantSemanticKeywordSearchService {
    qdrantClient;
    constructor(qdrantClient) {
        this.qdrantClient = qdrantClient;
    }
    async search(collectionName, query, limit, filter) {
        try {
            // Use Qdrant's discover API for semantic search with text queries
            // This is more advanced than simple BM25 but still keyword-based
            if (!this.qdrantClient.discover) {
                throw new Error('Discover method not available on Qdrant client');
            }
            const discoverResult = await this.qdrantClient.discover(collectionName, {
                target: query,
                limit: limit,
                filter: filter,
                with_payload: true,
                with_vector: false
            });
            return discoverResult.map((point) => ({
                id: point.id.toString(),
                score: point.score || 0,
                payload: point.payload || {},
                content: point.payload?.content || ''
            }));
        }
        catch (error) {
            console.error('Semantic keyword search failed:', error);
            throw new Error(`Semantic keyword search failed: ${error.message}`);
        }
    }
}
