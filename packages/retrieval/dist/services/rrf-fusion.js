export class ReciprocalRankFusionService {
    fuseResults(vectorResults, keywordResults, config) {
        const startTime = performance.now();
        // Create maps for efficient lookups
        const vectorMap = new Map();
        const keywordMap = new Map();
        // Index vector results by ID with their ranks
        vectorResults.forEach((result, index) => {
            vectorMap.set(result.id, { result, rank: index + 1 });
        });
        // Index keyword results by ID with their ranks
        keywordResults.forEach((result, index) => {
            keywordMap.set(result.id, { result, rank: index + 1 });
        });
        // Get all unique document IDs
        const allIds = new Set([...vectorMap.keys(), ...keywordMap.keys()]);
        // Calculate RRF scores for each document
        const fusedResults = [];
        for (const id of allIds) {
            const vectorEntry = vectorMap.get(id);
            const keywordEntry = keywordMap.get(id);
            let rrfScore = 0;
            let vectorScore;
            let keywordScore;
            let searchType = 'hybrid';
            // Calculate RRF contribution from vector search
            if (vectorEntry) {
                const vectorRrfContribution = config.vectorWeight / (config.k + vectorEntry.rank);
                rrfScore += vectorRrfContribution;
                vectorScore = vectorEntry.result.score;
            }
            // Calculate RRF contribution from keyword search
            if (keywordEntry) {
                const keywordRrfContribution = config.keywordWeight / (config.k + keywordEntry.rank);
                rrfScore += keywordRrfContribution;
                keywordScore = keywordEntry.result.score;
            }
            // Determine search type
            if (vectorEntry && keywordEntry) {
                searchType = 'hybrid';
            }
            else if (vectorEntry) {
                searchType = 'vector_only';
            }
            else {
                searchType = 'keyword_only';
            }
            // Get document content and payload (prefer vector result, fallback to keyword result)
            const sourceResult = vectorEntry?.result || keywordEntry?.result;
            if (!sourceResult)
                continue;
            fusedResults.push({
                id,
                score: rrfScore,
                vectorScore,
                keywordScore,
                fusionScore: rrfScore,
                searchType,
                payload: sourceResult.payload,
                content: this.extractContent(sourceResult)
            });
        }
        // Sort by RRF score (descending)
        fusedResults.sort((a, b) => b.fusionScore - a.fusionScore);
        return fusedResults;
    }
    extractContent(result) {
        // For keyword results, content is directly available
        if ('content' in result && result.content) {
            return result.content;
        }
        // For vector results, extract from payload
        if (result.payload?.content) {
            return result.payload.content;
        }
        return undefined;
    }
}
// Advanced RRF implementation with score normalization
export class NormalizedRrfFusionService {
    fuseResults(vectorResults, keywordResults, config) {
        // Normalize scores before fusion
        const normalizedVectorResults = this.normalizeScores(vectorResults);
        const normalizedKeywordResults = this.normalizeScores(keywordResults);
        // Create fusion map
        const fusionMap = new Map();
        // Process vector results
        normalizedVectorResults.forEach((result, index) => {
            const rank = index + 1;
            const rrfContribution = config.vectorWeight / (config.k + rank);
            const normalizedContribution = config.vectorWeight * result.score;
            fusionMap.set(result.id, {
                id: result.id,
                score: rrfContribution + normalizedContribution,
                vectorScore: result.score,
                fusionScore: rrfContribution + normalizedContribution,
                searchType: 'vector_only',
                payload: result.payload,
                content: result.payload?.content
            });
        });
        // Process keyword results and merge
        normalizedKeywordResults.forEach((result, index) => {
            const rank = index + 1;
            const rrfContribution = config.keywordWeight / (config.k + rank);
            const normalizedContribution = config.keywordWeight * result.score;
            const existingResult = fusionMap.get(result.id);
            if (existingResult) {
                // Merge with existing vector result
                existingResult.score += rrfContribution + normalizedContribution;
                existingResult.fusionScore += rrfContribution + normalizedContribution;
                existingResult.keywordScore = result.score;
                existingResult.searchType = 'hybrid';
                // Prefer keyword content if available
                if ('content' in result && result.content) {
                    existingResult.content = result.content;
                }
            }
            else {
                // Create new keyword-only result
                fusionMap.set(result.id, {
                    id: result.id,
                    score: rrfContribution + normalizedContribution,
                    keywordScore: result.score,
                    fusionScore: rrfContribution + normalizedContribution,
                    searchType: 'keyword_only',
                    payload: result.payload,
                    content: 'content' in result ? result.content : result.payload?.content
                });
            }
        });
        // Convert to array and sort
        const fusedResults = Array.from(fusionMap.values());
        fusedResults.sort((a, b) => b.fusionScore - a.fusionScore);
        return fusedResults;
    }
    normalizeScores(results) {
        if (results.length === 0)
            return [];
        const scores = results.map(r => r.score || 0);
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const scoreRange = maxScore - minScore;
        // Avoid division by zero
        if (scoreRange === 0) {
            return results.map(r => ({ ...r, score: 1.0 }));
        }
        return results.map(result => ({
            ...result,
            score: ((result.score || 0) - minScore) / scoreRange
        }));
    }
}
// Utility class for RRF performance monitoring
export class RrfPerformanceMonitor {
    static measureFusion(fusionFn, vectorCount, keywordCount) {
        const startTime = performance.now();
        const result = fusionFn();
        const endTime = performance.now();
        const metrics = {
            fusionDuration: endTime - startTime,
            vectorResultCount: vectorCount,
            keywordResultCount: keywordCount,
            finalResultCount: Array.isArray(result) ? result.length : 0
        };
        return { result, metrics };
    }
}
